import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmDeal, CrmDealSchema } from '../../database/schemas/crm-deal.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CrmConnectionsController } from './crm-connections.controller';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmDealsRepository } from './crm-deals.repository';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmSyncService } from './crm-sync.service';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmRepository } from './crm.repository';
import { HubSpotProvider } from './providers/hubspot.provider';
import { SalesforceProvider } from './providers/salesforce.provider';

@Module({
  imports: [
    ConfigModule,
    AuditLogsModule,
    IntegrationsModule,
    MongooseModule.forFeature([{ name: CrmDeal.name, schema: CrmDealSchema }]),
  ],
  controllers: [CrmController, CrmConnectionsController],
  providers: [
    CrmService,
    CrmRepository,
    CrmDealsRepository,
    CrmConnectionsService,
    CrmSyncService,
    CrmAnalyticsService,
    CrmProviderRegistry,
    HubSpotProvider,
    SalesforceProvider,
  ],
  exports: [CrmService],
})
export class CrmModule {}
