import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DiagnosticQuestionDocument = HydratedDocument<DiagnosticQuestion>;

@Schema({ _id: false })
export class DiagnosticChoice {
  @Prop({ required: true, trim: true, maxlength: 10 })
  label!: string; // A, B, C, D

  @Prop({ required: true, trim: true, maxlength: 1000 })
  text!: string;

  @Prop({ required: true, min: 0, default: 0 })
  points!: number;
}

export const DiagnosticChoiceSchema =
  SchemaFactory.createForClass(DiagnosticChoice);

@Schema({ timestamps: true, collection: 'diagnostic_questions' })
export class DiagnosticQuestion {
  @Prop({ required: true, index: true })
  categoryId!: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  title!: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ type: Number, default: 0 })
  order!: number;

  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;

  @Prop({ type: [DiagnosticChoiceSchema], default: [] })
  choices!: DiagnosticChoice[];
}

export const DiagnosticQuestionSchema =
  SchemaFactory.createForClass(DiagnosticQuestion);
DiagnosticQuestionSchema.index({ categoryId: 1, isActive: 1, order: 1 });
