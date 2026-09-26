import { Injectable } from '@nestjs/common';
import {
  CreateCrmContactInput,
  CreateCrmDealInput,
  CrmProviderType,
  UpdateCrmDealInput,
} from '../../common/types/crm-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmDealsRepository } from './crm-deals.repository';
import { CrmProviderRegistry } from './crm-provider.registry';

@Injectable()
export class CrmService {
  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly providers: CrmProviderRegistry,
    private readonly deals: CrmDealsRepository,
    private readonly auditLogs: AuditLogsService,
  ) {}

  createContact(
    organizationId: string,
    input: CreateCrmContactInput,
    provider?: CrmProviderType,
  ) {
    return this.connections.execute(
      organizationId,
      provider,
      ({ provider: resolvedProvider, accessToken, metadata }) =>
        this.providers.get(resolvedProvider).createContact(accessToken, {
          ...input,
          instanceUrl: metadata.instanceUrl,
        }),
    );
  }

  async createDeal(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
    input: CreateCrmDealInput,
  ) {
    const deal = await this.connections.execute(
      organizationId,
      provider,
      ({ accessToken, metadata, provider: resolvedProvider }) =>
        this.providers.get(resolvedProvider).createDeal(accessToken, {
          ...input,
          instanceUrl: metadata.instanceUrl,
        }),
    );
    const saved = await this.deals.upsert(
      organizationId,
      provider,
      deal,
      new Date(),
      new Date(),
    );
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_DEAL_CREATED',
      resourceType: 'crm_deal',
      resourceId: deal.externalId,
      metadata: { provider },
    });
    return saved;
  }

  async updateDeal(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
    externalId: string,
    input: UpdateCrmDealInput,
  ) {
    const deal = await this.connections.execute(
      organizationId,
      provider,
      ({ accessToken, metadata, provider: resolvedProvider }) =>
        this.providers
          .get(resolvedProvider)
          .updateDeal(accessToken, externalId, {
            ...input,
            instanceUrl: metadata.instanceUrl,
          }),
    );
    const saved = await this.deals.upsert(
      organizationId,
      provider,
      deal,
      new Date(),
      new Date(),
    );
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_DEAL_UPDATED',
      resourceType: 'crm_deal',
      resourceId: externalId,
      metadata: { provider },
    });
    return saved;
  }
}
