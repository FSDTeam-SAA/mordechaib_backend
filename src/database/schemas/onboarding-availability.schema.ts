import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OnboardingAvailabilityDocument =
  HydratedDocument<OnboardingAvailability>;

@Schema({ timestamps: true, collection: 'onboarding_availability' })
export class OnboardingAvailability {
  @Prop({ required: true, unique: true, default: 'DEFAULT' })
  key!: string;

  @Prop({ required: true, trim: true })
  timezone!: string;

  @Prop({ required: true, trim: true })
  startDate!: string;

  @Prop({ trim: true })
  endDate?: string;

  @Prop({ type: [Number], required: true, default: [0, 1, 2, 3, 4, 5, 6] })
  weekdays!: number[];

  @Prop({ required: true, trim: true })
  dailyStartTime!: string;

  @Prop({ required: true, trim: true })
  dailyEndTime!: string;

  @Prop({ required: true, min: 15, max: 480, default: 90 })
  meetingDurationMinutes!: number;

  @Prop({ required: true, min: 0, max: 120, default: 0 })
  bufferMinutes!: number;

  @Prop({ type: [String], default: [] })
  blockedDates!: string[];

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ required: true })
  updatedBy!: string;
}

export const OnboardingAvailabilitySchema = SchemaFactory.createForClass(
  OnboardingAvailability,
);

