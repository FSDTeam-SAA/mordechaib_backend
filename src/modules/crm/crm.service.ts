import { Injectable } from '@nestjs/common';
import { HubSpotProvider } from './providers/hubspot.provider';
import { SalesforceProvider } from './providers/salesforce.provider';
import {
  CreateCrmContactInput,
  CrmProvider,
} from '../../common/types/crm-provider.interface';
import { CrmRepository } from './crm.repository';

@Injectable()
export class CrmService {
  constructor(
    private readonly repository: CrmRepository,
    private readonly hubspot: HubSpotProvider,
    private readonly salesforce: SalesforceProvider,
  ) {}

  async createContact(organizationId: string, input: CreateCrmContactInput) {
    const provider = await this.resolveProvider(organizationId);
    return provider.createContact(input);
  }

  private async resolveProvider(organizationId: string): Promise<CrmProvider> {
    const integration = await this.repository.findConnectedCrm(organizationId);
    if (integration?.provider === 'SALESFORCE') return this.salesforce;
    return this.hubspot;
  }
}
