import { Module } from '@nestjs/common';
import { AiActionsModule } from '../ai-actions/ai-actions.module';
import { AiIntegrationModule } from '../ai-integration/ai-integration.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SourceAnalysesModule } from '../source-analyses/source-analyses.module';
import { TwilioModule } from '../twilio/twilio.module';
import { ContactsModule } from '../contacts/contacts.module';
import { MessagesModule } from '../messages/messages.module';
import { CallIntelligenceController } from './call-intelligence.controller';
import { CallIntelligenceAudioPlaybackController } from './call-intelligence-audio-playback.controller';
import { CallIntelligenceDeletionService } from './call-intelligence-deletion.service';
import { CallIntelligenceProposalsController } from './call-intelligence-proposals.controller';
import { CallIntelligenceProposalsFacade } from './call-intelligence-proposals.facade';
import { CallIntelligenceService } from './call-intelligence.service';
import { CallAudioPlaybackTokenService } from './call-audio-playback-token.service';
import { CallAudioStreamingService } from './call-audio-streaming.service';

@Module({
  imports: [
    AiActionsModule,
    AiIntegrationModule,
    AuditLogsModule,
    SourceAnalysesModule,
    TwilioModule,
    ContactsModule,
    MessagesModule,
  ],
  controllers: [
    CallIntelligenceController,
    CallIntelligenceAudioPlaybackController,
    CallIntelligenceProposalsController,
  ],
  providers: [
    CallIntelligenceService,
    CallIntelligenceDeletionService,
    CallIntelligenceProposalsFacade,
    CallAudioPlaybackTokenService,
    CallAudioStreamingService,
  ],
  exports: [CallIntelligenceService],
})
export class CallIntelligenceModule {}
