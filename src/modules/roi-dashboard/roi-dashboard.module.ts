import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AiActionProposal,
  AiActionProposalSchema,
} from '../../database/schemas/ai-action-proposal.schema';
import {
  EmailDraft,
  EmailDraftSchema,
} from '../../database/schemas/email-draft.schema';
import {
  RoiConfiguration,
  RoiConfigurationSchema,
} from '../../database/schemas/roi-configuration.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CrmModule } from '../crm/crm.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RoiAnalyticsRepository } from './roi-analytics.repository';
import { RoiDashboardController } from './roi-dashboard.controller';
import { RoiDashboardService } from './roi-dashboard.service';
import { RoiReportService } from './roi-report.service';
import { RoiSettingsRepository } from './roi-settings.repository';
import { RoiSettingsService } from './roi-settings.service';

@Module({
  imports: [
    OrganizationsModule,
    CrmModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: AiActionProposal.name, schema: AiActionProposalSchema },
      { name: EmailDraft.name, schema: EmailDraftSchema },
      { name: RoiConfiguration.name, schema: RoiConfigurationSchema },
    ]),
  ],
  controllers: [RoiDashboardController],
  providers: [
    RoiAnalyticsRepository,
    RoiSettingsRepository,
    RoiSettingsService,
    RoiDashboardService,
    RoiReportService,
  ],
  exports: [RoiDashboardService, RoiSettingsService],
})
export class RoiDashboardModule {}
