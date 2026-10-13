import { Injectable } from '@nestjs/common';
import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import {
  aiIsoTimestamp,
  boundedAiText,
  boundedRows,
  createAiFact,
  type AiFact,
} from '../../common/helpers/ai-fact.helper';
import type {
  CrmObjectSyncSelection,
  CrmObjectSyncState,
} from '../../common/types/crm-object-sync.interface';
import type {
  CrmConnectionMetadata,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmDealsRepository } from './crm-deals.repository';
import { CrmRecordsRepository } from './crm-records.repository';
import { CrmRepository } from './crm.repository';

export type CrmBriefingFactGroup = {
  availability: BriefingFactAvailability;
  items: AiFact[];
};

export type CrmBriefingFacts = {
  sales: CrmBriefingFactGroup;
  customers: CrmBriefingFactGroup;
};

const LIMITS = { deals: 50, customerRecords: 50, properties: 80 } as const;
const CUSTOMER_OBJECT_TYPES = new Set([
  'account',
  'accounts',
  'company',
  'companies',
  'contact',
  'contacts',
  'lead',
  'leads',
]);
const SENSITIVE_PROPERTY =
  /(?:access|refresh|api)[_-]?token|secret|password|credential|private[_-]?key/i;

@Injectable()
export class CrmBriefingFactsService {
  constructor(
    private readonly connections: CrmRepository,
    private readonly deals: CrmDealsRepository,
    private readonly records: CrmRecordsRepository,
    private readonly analytics: CrmAnalyticsService,
  ) {}

  async prepare(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<CrmBriefingFacts> {
    const connection = await this.connections.findDefaultConnected(
      input.organizationId,
      { includeCredentials: false },
    );
    if (!connection) return this.unavailable();

    const provider = connection.provider as CrmProviderType;
    const metadata = (connection.metadata || {}) as CrmConnectionMetadata;
    const selections = metadata.objectSync?.configuration?.objects || [];
    const states = metadata.objectSync?.objects || [];
    const customerSelections = selections.filter(({ objectType }) =>
      this.isCustomerObject(objectType),
    );
    const customerObjectTypes = customerSelections.map(
      ({ objectType }) => objectType,
    );

    const [revenue, dealRows, customerRows] = await Promise.all([
      this.analytics.revenue({
        organizationId: input.organizationId,
        provider,
        groupBy: 'stage',
        from: input.from.toISOString(),
        to: input.to.toISOString(),
      }),
      this.deals.findForBriefing({
        organizationId: input.organizationId,
        provider,
        from: input.from,
        to: input.to,
        limit: LIMITS.deals + 1,
      }),
      this.records.findForBriefing({
        organizationId: input.organizationId,
        provider,
        objectTypes: customerObjectTypes,
        limit: LIMITS.customerRecords + 1,
      }),
    ]);

    const boundedDeals = boundedRows(dealRows, LIMITS.deals);
    const boundedCustomers = boundedRows(customerRows, LIMITS.customerRecords);
    const syncedAt = aiIsoTimestamp(metadata.lastSyncedAt);
    const salesItems = boundedDeals.items.map((deal) =>
      createAiFact('crm-deal', 'CRM_DEAL', deal, {
        provider,
        externalId: deal.externalId,
        title: deal.name,
        amount: deal.amount,
        currency: deal.currency,
        providerStage: deal.providerStage,
        stageCategory: deal.stageCategory,
        closeDate: aiIsoTimestamp(deal.closeDate),
        ownerId: deal.ownerId,
        ownerName: deal.ownerName,
        providerUpdatedAt: aiIsoTimestamp(deal.providerUpdatedAt),
        syncedAt: aiIsoTimestamp(deal.syncedAt),
      }),
    );
    if (revenue.currencies.length > 0) {
      salesItems.unshift({
        id: `crm-revenue-${provider}-${input.from.toISOString()}-${input.to.toISOString()}`,
        sourceType: 'CRM_REVENUE_AGGREGATE',
        sourceId: `crm-revenue:${provider}:${input.from.toISOString()}:${input.to.toISOString()}`,
        capturedAt: syncedAt || input.to.toISOString(),
        data: {
          provider,
          title: 'CRM revenue by deal stage',
          groupBy: revenue.groupBy,
          range: revenue.range,
          currencies: revenue.currencies,
          derivation:
            'Aggregated from non-archived synchronized CRM deals. Currency totals remain separate and are not converted.',
        },
      });
    }

    const selectedFields = new Map(
      customerSelections.map(({ objectType, fields }) => [objectType, fields]),
    );
    const customerItems = boundedCustomers.items.map((record) =>
      createAiFact('crm-customer', 'CRM_RECORD', record, {
        provider,
        objectType: record.objectType,
        externalId: record.externalId,
        properties: this.safeProperties(
          record.properties,
          selectedFields.get(record.objectType) || [],
        ),
        associations: this.safeAssociations(record.associations),
        providerUpdatedAt: aiIsoTimestamp(record.providerUpdatedAt),
        syncedAt: aiIsoTimestamp(record.syncedAt),
        metricPolicy:
          'Only explicitly synchronized CRM fields may support health, NPS, churn, or renewal claims. Missing fields mean the metric is unavailable.',
      }),
    );

    return {
      sales: {
        availability: this.salesAvailability(
          metadata,
          boundedDeals.truncated,
          salesItems.length,
        ),
        items: salesItems,
      },
      customers: {
        availability: this.customerAvailability(
          customerSelections,
          states,
          boundedCustomers.truncated,
        ),
        items: customerItems,
      },
    };
  }

  private unavailable(): CrmBriefingFacts {
    const group = (): CrmBriefingFactGroup => ({
      availability: BriefingFactAvailability.UNAVAILABLE,
      items: [],
    });
    return { sales: group(), customers: group() };
  }

  private salesAvailability(
    metadata: CrmConnectionMetadata,
    truncated: boolean,
    itemCount: number,
  ) {
    if (truncated || metadata.syncStatus === 'FAILED') {
      return BriefingFactAvailability.PARTIAL;
    }
    if (!metadata.lastSyncedAt && itemCount === 0) {
      return BriefingFactAvailability.PARTIAL;
    }
    return BriefingFactAvailability.AVAILABLE;
  }

  private customerAvailability(
    selections: CrmObjectSyncSelection[],
    states: CrmObjectSyncState[],
    truncated: boolean,
  ) {
    if (selections.length === 0) {
      return BriefingFactAvailability.UNAVAILABLE;
    }
    const stateByObject = new Map(
      states.map((state) => [state.objectType, state.status]),
    );
    const incomplete = selections.some(
      ({ objectType }) => stateByObject.get(objectType) !== 'SYNCHRONIZED',
    );
    return truncated || incomplete
      ? BriefingFactAvailability.PARTIAL
      : BriefingFactAvailability.AVAILABLE;
  }

  private isCustomerObject(objectType: string) {
    return CUSTOMER_OBJECT_TYPES.has(objectType.trim().toLowerCase());
  }

  private safeProperties(
    properties: Record<string, unknown>,
    selectedFields: string[],
  ) {
    const selected = new Set(selectedFields);
    return Object.fromEntries(
      Object.entries(properties)
        .filter(([key]) => selected.has(key) && !SENSITIVE_PROPERTY.test(key))
        .slice(0, LIMITS.properties)
        .map(([key, value]) => [key, this.safeValue(value)]),
    );
  }

  private safeAssociations(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 25)
        .map(([key, ids]) => [
          key,
          Array.isArray(ids)
            ? ids.filter((id) => typeof id === 'string').slice(0, 50)
            : [],
        ]),
    );
  }

  private safeValue(value: unknown): unknown {
    if (typeof value === 'string') return boundedAiText(value, 2_000);
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => this.safeValue(item));
    }
    return undefined;
  }
}
