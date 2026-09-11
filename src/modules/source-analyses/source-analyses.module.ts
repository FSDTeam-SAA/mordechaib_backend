import { Module } from '@nestjs/common';
import { SourceAnalysesRepository } from './source-analyses.repository';

@Module({
  providers: [SourceAnalysesRepository],
  exports: [SourceAnalysesRepository],
})
export class SourceAnalysesModule {}
