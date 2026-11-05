import { Module } from '@nestjs/common';
import { SourceAnalysesRepository } from './source-analyses.repository';
import { MeetingAnalysisInsightsService } from './meeting-analysis-insights.service';

@Module({
  providers: [SourceAnalysesRepository, MeetingAnalysisInsightsService],
  exports: [SourceAnalysesRepository, MeetingAnalysisInsightsService],
})
export class SourceAnalysesModule {}
