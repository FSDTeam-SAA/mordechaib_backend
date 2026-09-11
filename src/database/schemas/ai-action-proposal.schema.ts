import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AgentType } from '../../common/enums/agent-type.enum';

export type AiActionProposalDocument = HydratedDocument<AiActionProposal>;

export enum AiActionType {
  CREATE_TASK = 'CREATE_TASK',
  SCHEDULE_MEETING = 'SCHEDULE_MEETING',
}

export enum AiActionProposalStatus {
  ANALYZING = 'ANALYZING',
  NEEDS_CLARIFICATION = 'NEEDS_CLARIFICATION',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTING = 'EXECUTING',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',
}

export enum AiProposalSourceType {
  CALL_AUDIO = 'CALL_AUDIO',
  CALL_TRANSCRIPT = 'CALL_TRANSCRIPT',
  ZOOM_MEETING = 'ZOOM_MEETING',
  GOOGLE_MEET = 'GOOGLE_MEET',
  USER_MESSAGE = 'USER_MESSAGE',
}

export enum AiActionTargetType {
  TASK = 'TASK',
  PLATFORM_MEETING = 'PLATFORM_MEETING',
  CALENDAR_EVENT = 'CALENDAR_EVENT',
}

@Schema({ _id: false })
export class AiClarificationQuestion {
  @Prop({ required: true, trim: true, maxlength: 128 })
  id!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  field!: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  question!: string;

  @Prop({ trim: true, maxlength: 32 })
  inputType?: string;

  @Prop({ default: true })
  required!: boolean;
}

export const AiClarificationQuestionSchema =
  SchemaFactory.createForClass(AiClarificationQuestion);

@Schema({ _id: false })
export class AiProposalAgent {
  @Prop({ required: true, trim: true, maxlength: 128 })
  id!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({
    required: true,
    enum: Object.values(AgentType),
    index: true,
  })
  type!: AgentType;
}

export const AiProposalAgentSchema =
  SchemaFactory.createForClass(AiProposalAgent);

@Schema({ _id: false })
export class AiProposalSource {
  @Prop({
    required: true,
    enum: Object.values(AiProposalSourceType),
  })
  type!: AiProposalSourceType;

  @Prop({ required: true, trim: true, maxlength: 200 })
  id!: string;
}

export const AiProposalSourceSchema =
  SchemaFactory.createForClass(AiProposalSource);

@Schema({ _id: false })
export class AiProposalEvidence {
  @Prop({ trim: true, maxlength: 200 })
  segmentId?: string;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  text!: string;

  @Prop({ trim: true, maxlength: 200 })
  speaker?: string;

  @Prop({ min: 0 })
  startTimeSeconds?: number;

  @Prop({ min: 0 })
  endTimeSeconds?: number;
}

export const AiProposalEvidenceSchema =
  SchemaFactory.createForClass(AiProposalEvidence);

@Schema({ _id: false })
export class AiSentimentScore {
  @Prop({ required: true, min: 0, max: 100 })
  positive!: number;

  @Prop({ required: true, min: 0, max: 100 })
  neutral!: number;

  @Prop({ required: true, min: 0, max: 100 })
  negative!: number;
}

export const AiSentimentScoreSchema =
  SchemaFactory.createForClass(AiSentimentScore);

@Schema({ _id: false })
export class AiSentimentAnalysis {
  @Prop({ type: AiSentimentScoreSchema, required: true })
  score!: AiSentimentScore;
}

export const AiSentimentAnalysisSchema =
  SchemaFactory.createForClass(AiSentimentAnalysis);

@Schema({ _id: false })
export class AiCustomerIntelligence {
  @Prop({ required: true, min: 0, max: 100 })
  healthScore!: number;

  @Prop({ required: true, trim: true, uppercase: true, maxlength: 32 })
  riskLevel!: string;
}

export const AiCustomerIntelligenceSchema =
  SchemaFactory.createForClass(AiCustomerIntelligence);

@Schema({ _id: false })
export class AiPatternDetection {
  @Prop({ min: 0, max: 100 })
  valueProposition?: number;

  @Prop({ min: 0, max: 100 })
  pricingObjection?: number;

  @Prop({ min: 0, max: 100 })
  budgetApproval?: number;

  @Prop({ min: 0, max: 100 })
  marketTrends?: number;

  @Prop({ min: 0, max: 100 })
  followUpRequests?: number;
}

export const AiPatternDetectionSchema =
  SchemaFactory.createForClass(AiPatternDetection);

@Schema({ _id: false })
export class AiAnalysisSummary {
  @Prop({ type: AiSentimentAnalysisSchema, required: true })
  sentimentAnalysis!: AiSentimentAnalysis;

  @Prop({ type: AiCustomerIntelligenceSchema, required: true })
  customerIntelligence!: AiCustomerIntelligence;

  @Prop({ type: AiPatternDetectionSchema, required: true })
  patternDetection!: AiPatternDetection;
}

export const AiAnalysisSummarySchema =
  SchemaFactory.createForClass(AiAnalysisSummary);

@Schema({ timestamps: true, collection: 'ai_action_proposals' })
export class AiActionProposal {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, trim: true, maxlength: 20 })
  schemaVersion!: string;

  @Prop({ required: true, trim: true, maxlength: 400 })
  proposalId!: string;

  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  requestId!: string;

  /** Conversation that produced this proposal, when the source is a chat message. */
  @Prop({ trim: true, maxlength: 100, index: true })
  conversationId?: string;

  @Prop({ required: true, select: false })
  proposalHash!: string;

  @Prop({
    required: true,
    enum: Object.values(AiActionType),
    index: true,
  })
  actionType!: AiActionType;

  @Prop({ type: AiProposalAgentSchema, required: true })
  proposedByAgent!: AiProposalAgent;

  @Prop({ type: AiProposalSourceSchema, required: true })
  source!: AiProposalSource;

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;

  @Prop({ type: [AiProposalEvidenceSchema], default: [] })
  evidence!: AiProposalEvidence[];

  /** Source-level AI analysis snapshot used by frontend and reporting. */
  @Prop({ type: AiAnalysisSummarySchema, required: true })
  analysis!: AiAnalysisSummary;

  @Prop({ type: [AiClarificationQuestionSchema], default: [] })
  clarificationQuestions!: AiClarificationQuestion[];

  @Prop({ type: Object, default: {} })
  clarificationAnswers!: Record<string, string>;

  @Prop({ required: true, default: 1, min: 1 })
  revision!: number;

  @Prop({
    required: true,
    enum: Object.values(AiActionProposalStatus),
    default: AiActionProposalStatus.PENDING,
    index: true,
  })
  status!: AiActionProposalStatus;

  @Prop({ index: true })
  approvedByUserId?: string;

  @Prop({ trim: true, maxlength: 200 })
  approvedByUserName?: string;

  @Prop()
  approvedAt?: Date;

  @Prop({ index: true })
  rejectedByUserId?: string;

  @Prop({ trim: true, maxlength: 200 })
  rejectedByUserName?: string;

  @Prop()
  rejectedAt?: Date;

  @Prop({ trim: true, maxlength: 1000 })
  rejectionReason?: string;

  @Prop()
  executionStartedAt?: Date;

  @Prop({ trim: true, maxlength: 100 })
  executedBy?: string;

  @Prop()
  executedAt?: Date;

  @Prop({ enum: Object.values(AiActionTargetType) })
  targetResourceType?: AiActionTargetType;

  @Prop({ trim: true, maxlength: 200 })
  targetResourceId?: string;

  @Prop({ trim: true, maxlength: 2000 })
  executionError?: string;

  @Prop({ required: true, default: 0, min: 0 })
  retryCount!: number;
}

export const AiActionProposalSchema =
  SchemaFactory.createForClass(AiActionProposal);

AiActionProposalSchema.index(
  { organizationId: 1, proposalId: 1 },
  { unique: true },
);
AiActionProposalSchema.index({
  organizationId: 1,
  status: 1,
  createdAt: -1,
});
AiActionProposalSchema.index({
  organizationId: 1,
  actionType: 1,
  status: 1,
});
AiActionProposalSchema.index({
  organizationId: 1,
  'proposedByAgent.id': 1,
  createdAt: -1,
});
AiActionProposalSchema.index({
  organizationId: 1,
  'proposedByAgent.type': 1,
  createdAt: -1,
});
AiActionProposalSchema.index({
  organizationId: 1,
  'source.id': 1,
  status: 1,
  actionType: 1,
  'source.type': 1,
});
AiActionProposalSchema.index({
  organizationId: 1,
  conversationId: 1,
  status: 1,
  createdAt: -1,
});
