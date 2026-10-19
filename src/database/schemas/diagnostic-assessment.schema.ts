import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DiagnosticAssessmentDocument =
  HydratedDocument<DiagnosticAssessment>;

export enum DiagnosticAssessmentStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

@Schema({ _id: false })
export class DiagnosticAnswer {
  @Prop({ required: true })
  questionId!: string;

  @Prop({ required: true })
  categoryId!: string;

  @Prop({ required: true, trim: true })
  selectedChoiceLabel!: string;

  @Prop({ required: true, min: 0, default: 0 })
  pointsAwarded!: number;
}

export const DiagnosticAnswerSchema =
  SchemaFactory.createForClass(DiagnosticAnswer);

@Schema({ timestamps: true, collection: 'diagnostic_assessments' })
export class DiagnosticAssessment {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ type: [DiagnosticAnswerSchema], default: [] })
  answers!: DiagnosticAnswer[];

  @Prop({ type: Number, default: 0 })
  totalScore!: number;

  @Prop({ type: Number, default: 0 })
  maxPossibleScore!: number;

  @Prop({ type: Number, default: 0 })
  questionsAnswered!: number;

  @Prop({ type: Number, default: 0 })
  totalQuestions!: number;

  @Prop()
  completedAt?: Date;

  @Prop({
    type: String,
    enum: Object.values(DiagnosticAssessmentStatus),
    default: DiagnosticAssessmentStatus.COMPLETED,
    index: true,
  })
  status!: DiagnosticAssessmentStatus;
}

export const DiagnosticAssessmentSchema =
  SchemaFactory.createForClass(DiagnosticAssessment);
DiagnosticAssessmentSchema.index({ organizationId: 1, createdAt: -1 });
DiagnosticAssessmentSchema.index({ userId: 1, createdAt: -1 });
DiagnosticAssessmentSchema.index({
  organizationId: 1,
  userId: 1,
  createdAt: -1,
});
