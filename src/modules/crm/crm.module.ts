import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmRepository } from './crm.repository';
import { HubSpotProvider } from './providers/hubspot.provider';
import { SalesforceProvider } from './providers/salesforce.provider';

@Module({
  controllers: [CrmController],
  providers: [CrmService, CrmRepository, HubSpotProvider, SalesforceProvider],
  exports: [CrmService],
})
export class CrmModule {}
