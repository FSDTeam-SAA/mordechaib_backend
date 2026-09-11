import { Module } from '@nestjs/common';
import { AiActionsModule } from '../ai-actions/ai-actions.module';
import { SourceAnalysesModule } from '../source-analyses/source-analyses.module';
import { CallIntelligenceController } from './call-intelligence.controller';
import { CallIntelligenceService } from './call-intelligence.service';

@Module({
  imports: [AiActionsModule, SourceAnalysesModule],
  controllers: [CallIntelligenceController],
  providers: [CallIntelligenceService],
})
export class CallIntelligenceModule {}
