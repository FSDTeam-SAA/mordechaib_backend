import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ExecutiveBriefingType,
  StrategicNoteKind,
} from '../../common/enums/executive-briefing.enum';

export type StrategicNoteDocument = HydratedDocument<StrategicNote>;

@Schema({ timestamps: true, collection: 'strategic_notes' })
export class StrategicNote {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true, trim: true, maxlength: 5_000 })
  content!: string;

  @Prop({ trim: true, maxlength: 200 })
  title?: string;

  @Prop({
    type: String,
    enum: Object.values(StrategicNoteKind),
    default: StrategicNoteKind.NOTE,
  })
  kind!: StrategicNoteKind;

  @Prop({
    type: [String],
    enum: Object.values(ExecutiveBriefingType),
    default: Object.values(ExecutiveBriefingType),
  })
  appliesTo!: ExecutiveBriefingType[];

  @Prop({ required: true, default: Date.now, index: true })
  validFrom!: Date;

  @Prop({ index: true })
  validUntil?: Date;

  @Prop({ index: true })
  deletedAt?: Date;

  @Prop()
  deletedByUserId?: string;
}

export const StrategicNoteSchema = SchemaFactory.createForClass(StrategicNote);
StrategicNoteSchema.index({
  organizationId: 1,
  deletedAt: 1,
  validFrom: -1,
});
