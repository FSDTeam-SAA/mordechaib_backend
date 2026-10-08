import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmDeal, CrmDealSchema } from '../../database/schemas/crm-deal.schema';
import {
  CrmRecord,
  CrmRecordSchema,
} from '../../database/schemas/crm-record.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CrmConnectionsController } from './crm-connections.controller';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmDealsRepository } from './crm-deals.repository';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmObjectSyncService } from './crm-object-sync.service';
import { CrmSyncService } from './crm-sync.service';
import { CrmSyncConfigurationService } from './crm-sync-configuration.service';
import { CrmController } from './crm.controller';
import { CrmSchemaController } from './crm-schema.controller';
import { CrmRecordsController } from './crm-records.controller';
import { CrmRecordsService } from './crm-records.service';
import { CrmSchemaDiscoveryService } from './crm-schema-discovery.service';
import { CrmService } from './crm.service';
import { CrmRepository } from './crm.repository';
import { CrmRecordsRepository } from './crm-records.repository';
import { HubSpotProvider } from './providers/hubspot.provider';
import { SalesforceProvider } from './providers/salesforce.provider';

@Module({
  imports: [
    ConfigModule,
    AuditLogsModule,
    IntegrationsModule,
    MongooseModule.forFeature([
      { name: CrmDeal.name, schema: CrmDealSchema },
      { name: CrmRecord.name, schema: CrmRecordSchema },
    ]),
  ],
  controllers: [
    CrmController,
    CrmConnectionsController,
    CrmSchemaController,
    CrmRecordsController,
  ],
  providers: [
    CrmService,
    CrmRepository,
    CrmDealsRepository,
    CrmRecordsRepository,
    CrmRecordsService,
    CrmConnectionsService,
    CrmSyncService,
    CrmSyncConfigurationService,
    CrmAnalyticsService,
    CrmProviderRegistry,
    CrmObjectSyncService,
    CrmSchemaDiscoveryService,
    HubSpotProvider,
    SalesforceProvider,
  ],
  exports: [CrmService],
})
export class CrmModule {}
