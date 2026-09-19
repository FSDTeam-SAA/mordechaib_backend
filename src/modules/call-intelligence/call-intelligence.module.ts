import { Module } from '@nestjs/common';
import { AiActionsModule } from '../ai-actions/ai-actions.module';
import { AiIntegrationModule } from '../ai-integration/ai-integration.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SourceAnalysesModule } from '../source-analyses/source-analyses.module';
import { TwilioModule } from '../twilio/twilio.module';
import { CallIntelligenceController } from './call-intelligence.controller';
import { CallIntelligenceDeletionService } from './call-intelligence-deletion.service';
import { CallIntelligenceProposalsController } from './call-intelligence-proposals.controller';
import { CallIntelligenceProposalsFacade } from './call-intelligence-proposals.facade';
import { CallIntelligenceService } from './call-intelligence.service';

@Module({
  imports: [
    AiActionsModule,
    AiIntegrationModule,
    AuditLogsModule,
    SourceAnalysesModule,
    TwilioModule,
  ],
  controllers: [
    CallIntelligenceController,
    CallIntelligenceProposalsController,
  ],
  providers: [
    CallIntelligenceService,
    CallIntelligenceDeletionService,
    CallIntelligenceProposalsFacade,
  ],
})
export class CallIntelligenceModule {}
