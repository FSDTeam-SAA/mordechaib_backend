import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiSourceAnalysis } from '../../database/schemas/ai-source-analysis.schema';
import { AiProposalSource } from '../../database/schemas/ai-action-proposal.schema';

@Injectable()
export class SourceAnalysesRepository {
  constructor(
    @InjectModel(AiSourceAnalysis.name)
    private readonly model: Model<AiSourceAnalysis>,
  ) {}

  upsert(
    organizationId: string,
    requestId: string,
    source: AiProposalSource,
    analysis: Record<string, unknown>,
  ) {
    return this.model
      .findOneAndUpdate(
        {
          organizationId,
          'source.type': source.type,
          'source.id': source.id,
        },
        {
          $set: { requestId, source, ...analysis },
          $setOnInsert: { organizationId },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  findBySource(organizationId: string, source: AiProposalSource) {
    return this.model
      .findOne({
        organizationId,
        'source.type': source.type,
        'source.id': source.id,
      })
      .lean()
      .exec();
  }
}
