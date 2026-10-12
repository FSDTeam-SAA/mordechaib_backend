import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DiagnosticCategoryDocument = HydratedDocument<DiagnosticCategory>;

@Schema({ timestamps: true, collection: 'diagnostic_categories' })
export class DiagnosticCategory {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ type: Number, default: 0 })
  order!: number;

  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;
}

export const DiagnosticCategorySchema =
  SchemaFactory.createForClass(DiagnosticCategory);
DiagnosticCategorySchema.index({ isActive: 1, order: 1 });
