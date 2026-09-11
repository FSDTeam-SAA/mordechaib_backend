import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  AiCustomerIntelligenceSchema,
  AiPatternDetectionSchema,
  AiProposalSource,
  AiProposalSourceSchema,
  AiSentimentAnalysisSchema,
} from './ai-action-proposal.schema';

export type AiSourceAnalysisDocument = HydratedDocument<AiSourceAnalysis>;

export enum TranscriptInsightCategory {
  OBJECTION = 'OBJECTION',
  COMMITMENT = 'COMMITMENT',
  ACTION_ITEM = 'ACTION_ITEM',
}

@Schema({ _id: false })
export class TranscriptInsight {
  @Prop({ required: true, trim: true, maxlength: 128 })
  id!: string;

  @Prop({ required: true, enum: Object.values(TranscriptInsightCategory) })
  category!: TranscriptInsightCategory;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  text!: string;

  @Prop({ trim: true, maxlength: 200 })
  speaker?: string;

  @Prop({ min: 0 })
  startTimeSeconds?: number;

  @Prop({ min: 0 })
  endTimeSeconds?: number;

  @Prop({ min: 0, max: 1 })
  confidence?: number;
}

export const TranscriptInsightSchema =
  SchemaFactory.createForClass(TranscriptInsight);

@Schema({ timestamps: true, collection: 'ai_source_analyses' })
export class AiSourceAnalysis {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  requestId!: string;

  @Prop({ type: AiProposalSourceSchema, required: true })
  source!: AiProposalSource;

  @Prop({ trim: true, maxlength: 10_000 })
  summary?: string;

  @Prop({ min: 0, max: 1 })
  overallConfidence?: number;

  @Prop({ type: AiSentimentAnalysisSchema, required: true })
  sentimentAnalysis!: Record<string, unknown>;

  @Prop({ type: AiCustomerIntelligenceSchema, required: true })
  customerIntelligence!: Record<string, unknown>;

  @Prop({ type: AiPatternDetectionSchema, required: true })
  patternDetection!: Record<string, unknown>;

  @Prop({ type: [TranscriptInsightSchema], default: [] })
  classifiedSegments!: TranscriptInsight[];
}

export const AiSourceAnalysisSchema =
  SchemaFactory.createForClass(AiSourceAnalysis);

AiSourceAnalysisSchema.index(
  { organizationId: 1, 'source.type': 1, 'source.id': 1 },
  { unique: true },
);
AiSourceAnalysisSchema.index({
  organizationId: 1,
  requestId: 1,
});
