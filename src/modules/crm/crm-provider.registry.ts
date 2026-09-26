import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CrmProvider,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { HubSpotProvider } from './providers/hubspot.provider';
import { SalesforceProvider } from './providers/salesforce.provider';

@Injectable()
export class CrmProviderRegistry {
  constructor(
    private readonly hubspot: HubSpotProvider,
    private readonly salesforce: SalesforceProvider,
  ) {}

  get(provider: CrmProviderType): CrmProvider {
    if (provider === IntegrationProvider.HUBSPOT) return this.hubspot;
    if (provider === IntegrationProvider.SALESFORCE) return this.salesforce;
    throw new ServiceUnavailableException('Unsupported CRM provider');
  }

  isCrmProvider(provider: string): provider is CrmProviderType {
    return (
      provider === IntegrationProvider.HUBSPOT ||
      provider === IntegrationProvider.SALESFORCE
    );
  }
}
