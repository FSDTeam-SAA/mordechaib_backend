import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  CrmObjectSyncConfiguration,
  CrmObjectSyncSelection,
  CrmObjectSyncState,
} from '../../common/types/crm-object-sync.interface';
import type {
  CrmConnectionMetadata,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmRepository } from './crm.repository';
import { CrmSchemaDiscoveryService } from './crm-schema-discovery.service';
import { CrmSchemaPresentationService } from './crm-schema-presentation.service';
import { UpdateCrmSyncConfigurationDto } from './dto/update-crm-sync-configuration.dto';

const AUTOMATIC_DISCOVERY_TTL_MS = 24 * 60 * 60_000;
const MAX_AUTOMATIC_OBJECTS = 25;

const BUSINESS_OBJECT_PRIORITY = new Map(
  [
    'contacts',
    'contact',
    'companies',
    'account',
    'deals',
    'opportunity',
    'tasks',
    'task',
    'tickets',
    'case',
    'leads',
    'lead',
  ].map((objectType, index, values) => [objectType, values.length - index]),
);

@Injectable()
export class CrmSyncConfigurationService {
  private readonly logger = new Logger(CrmSyncConfigurationService.name);

  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly discovery: CrmSchemaDiscoveryService,
    private readonly repository: CrmRepository,
    private readonly auditLogs: AuditLogsService,
    private readonly presentation: CrmSchemaPresentationService,
  ) {}

  async ensureAutomatic(organizationId: string, provider: CrmProviderType) {
    const connection = await this.connections.resolve(organizationId, provider);
    const metadata = (connection.metadata || {}) as CrmConnectionMetadata;
    const existing = metadata.objectSync?.configuration;
    const capabilityFingerprint = this.capabilityFingerprint(metadata.scopes);

    // User and legacy configurations are authoritative. Only configurations
    // explicitly created by automatic discovery are reconciled.
    if (existing?.updatedAt && existing.configuredBy !== 'AUTOMATIC') {
      return {
        provider,
        created: false,
        configuration: existing,
        objects: metadata.objectSync?.objects || [],
      };
    }

    if (
      existing?.updatedAt &&
      existing.capabilityFingerprint === capabilityFingerprint &&
      this.isFresh(existing.lastDiscoveredAt)
    ) {
      return {
        provider,
        created: false,
        reconciled: false,
        configuration: existing,
        objects: metadata.objectSync?.objects || [],
      };
    }

    const selections = await this.automaticSelections(
      organizationId,
      provider,
      existing?.objects || [],
    );
    const discoveredAt = new Date().toISOString();
    const changed = !this.sameSelections(existing?.objects || [], selections);
    const configuration: CrmObjectSyncConfiguration = {
      schemaVersion: '1.0',
      configuredBy: 'AUTOMATIC',
      objects: selections,
      capabilityFingerprint,
      lastDiscoveredAt: discoveredAt,
      updatedAt:
        changed || !existing?.updatedAt ? discoveredAt : existing.updatedAt,
    };
    const states = this.nextStates(
      existing?.objects || [],
      metadata.objectSync?.objects || [],
      selections,
    );
    const saved = await this.repository.updateObjectSync(
      organizationId,
      provider,
      configuration,
      states,
    );
    if (!saved) {
      throw new BadRequestException(
        `Connect ${provider} before configuring synchronization`,
      );
    }

    return {
      provider,
      created: !existing?.updatedAt,
      reconciled: changed,
      configuration,
      objects: states,
    };
  }

  async update(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
    input: UpdateCrmSyncConfigurationDto,
  ) {
    const connection = await this.connections.resolve(organizationId, provider);
    const metadata = (connection.metadata || {}) as CrmConnectionMetadata;
    const selections = this.uniqueSelections(input.objects);

    await this.validateSelections(organizationId, provider, selections);

    const configuration: CrmObjectSyncConfiguration = {
      schemaVersion: '1.0',
      configuredBy: 'USER',
      objects: selections,
      updatedAt: new Date().toISOString(),
      updatedByUserId: userId,
    };
    const states = this.nextStates(
      metadata.objectSync?.configuration?.objects || [],
      metadata.objectSync?.objects || [],
      selections,
    );

    const saved = await this.repository.updateObjectSync(
      organizationId,
      provider,
      configuration,
      states,
    );
    if (!saved) {
      throw new BadRequestException(
        `Connect ${provider} before configuring synchronization`,
      );
    }

    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_SYNC_CONFIGURATION_UPDATED',
      resourceType: 'integration',
      resourceId: provider,
      metadata: {
        provider,
        objectTypes: selections.map(({ objectType }) => objectType),
        objectCount: selections.length,
      },
    });

    return { provider, configuration, objects: states };
  }

  private uniqueSelections(
    objects: UpdateCrmSyncConfigurationDto['objects'],
  ): CrmObjectSyncSelection[] {
    const seen = new Set<string>();
    return objects.map(({ objectType, fields }) => {
      if (seen.has(objectType)) {
        throw new BadRequestException(
          `Object ${objectType} is configured more than once`,
        );
      }
      seen.add(objectType);
      return { objectType, fields: [...fields] };
    });
  }

  private async validateSelections(
    organizationId: string,
    provider: CrmProviderType,
    selections: CrmObjectSyncSelection[],
  ) {
    if (selections.length === 0) return;

    const discovery = await this.discovery.listObjects(
      organizationId,
      provider,
    );
    const available = new Map(
      discovery.objects.map((object) => [object.objectType, object]),
    );

    for (const selection of selections) {
      const object = available.get(selection.objectType);
      if (!object?.readable) {
        throw new BadRequestException(
          `CRM object ${selection.objectType} is unavailable or not readable`,
        );
      }

      const schema = await this.discovery.describeObject(
        organizationId,
        provider,
        selection.objectType,
      );
      const readableFields = new Set(
        schema.fields
          .filter((field) => field.readable)
          .map((field) => field.name),
      );
      const invalidFields = selection.fields.filter(
        (field) => !readableFields.has(field),
      );
      if (invalidFields.length > 0) {
        throw new BadRequestException(
          `CRM object ${selection.objectType} has unavailable or unreadable fields: ${invalidFields.join(', ')}`,
        );
      }
    }
  }

  private nextStates(
    previousSelections: CrmObjectSyncSelection[],
    previousStates: CrmObjectSyncState[],
    nextSelections: CrmObjectSyncSelection[],
  ): CrmObjectSyncState[] {
    const previousFields = new Map(
      previousSelections.map(({ objectType, fields }) => [
        objectType,
        this.fieldSignature(fields),
      ]),
    );
    const states = new Map(
      previousStates.map((state) => [state.objectType, state]),
    );

    return nextSelections.map(({ objectType, fields }) => {
      const unchanged =
        previousFields.get(objectType) === this.fieldSignature(fields);
      return unchanged && states.has(objectType)
        ? { ...states.get(objectType)! }
        : { objectType, status: 'IDLE' };
    });
  }

  private fieldSignature(fields: string[]) {
    return [...fields].sort().join('\u0000');
  }

  private async automaticSelections(
    organizationId: string,
    provider: CrmProviderType,
    previousSelections: CrmObjectSyncSelection[],
  ): Promise<CrmObjectSyncSelection[]> {
    const discovery = await this.discovery.listObjects(
      organizationId,
      provider,
    );
    const selected = discovery.objects
      .filter((object) => object.readable)
      .sort((left, right) => {
        const priority =
          this.objectPriority(right.objectType) -
          this.objectPriority(left.objectType);
        return priority || left.label.localeCompare(right.label);
      })
      .slice(0, MAX_AUTOMATIC_OBJECTS);

    const selections: CrmObjectSyncSelection[] = [];
    const previous = new Map(
      previousSelections.map((selection) => [selection.objectType, selection]),
    );
    for (const object of selected) {
      try {
        const schema = await this.discovery.describeObject(
          organizationId,
          provider,
          object.objectType,
        );
        const fields = this.presentation.essentialFields(provider, schema, 100);
        if (fields.length > 0) {
          selections.push({ objectType: object.objectType, fields });
        }
      } catch (error) {
        const fallback = previous.get(object.objectType);
        if (fallback)
          selections.push({ ...fallback, fields: [...fallback.fields] });
        this.logger.warn(
          `CRM schema discovery skipped ${organizationId}:${provider}:${object.objectType}: ${this.errorMessage(error)}`,
        );
      }
    }
    return selections;
  }

  private sameSelections(
    left: CrmObjectSyncSelection[],
    right: CrmObjectSyncSelection[],
  ) {
    const signature = (selections: CrmObjectSyncSelection[]) =>
      [...selections]
        .map(
          ({ objectType, fields }) =>
            `${objectType}:${this.fieldSignature(fields)}`,
        )
        .sort()
        .join('\u0001');
    return signature(left) === signature(right);
  }

  private capabilityFingerprint(scopes: string[] | undefined) {
    return createHash('sha256')
      .update([...(scopes || [])].sort().join('\u0000'))
      .digest('hex');
  }

  private isFresh(value: string | undefined) {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return (
      Number.isFinite(timestamp) &&
      Date.now() - timestamp < AUTOMATIC_DISCOVERY_TTL_MS
    );
  }

  private objectPriority(objectType: string) {
    return BUSINESS_OBJECT_PRIORITY.get(objectType.toLowerCase()) || 0;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown provider error';
  }
}
