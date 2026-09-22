import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { SetupPaymentStatus } from '../../common/enums/setup-payment-status.enum';
import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';

export type OnboardingSetupDocument = HydratedDocument<OnboardingSetup>;

export class SelectedSetupPackage {
  @Prop({ trim: true, uppercase: true })
  code?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ required: true, default: 'USD', uppercase: true, trim: true })
  currency!: string;

  @Prop({ trim: true })
  description?: string;
}

export class SetupPayment {
  @Prop({ default: false })
  required!: boolean;

  @Prop({
    default: SetupPaymentStatus.NOT_REQUIRED,
    enum: Object.values(SetupPaymentStatus),
  })
  status!: SetupPaymentStatus;

  @Prop({ default: 0, min: 0 })
  amount!: number;

  @Prop({ default: 'USD', uppercase: true, trim: true })
  currency!: string;

  @Prop({ enum: ['STRIPE', 'MANUAL'] })
  provider?: string;

  @Prop()
  paymentIntentId?: string;

  @Prop()
  checkoutSessionId?: string;

  @Prop()
  paidAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop({ trim: true, maxlength: 200 })
  failureCode?: string;
}

export class SetupMeeting {
  @Prop({ default: false })
  isRequired!: boolean;

  @Prop({
    default: SetupMeetingStatus.NOT_REQUIRED,
    enum: Object.values(SetupMeetingStatus),
  })
  status!: SetupMeetingStatus;

  @Prop()
  meetingDate?: Date;

  @Prop()
  startTime?: Date;

  @Prop()
  endTime?: Date;

  @Prop({ default: 'UTC', trim: true })
  timezone!: string;

  @Prop({ trim: true })
  meetingLink?: string;

  /*
   * Future platform-host automation fields:
   * platform?: MeetingPlatform;
   * platformMeetingId?: string;
   *
   * Enable only after a platform onboarding-host account is configurable.
   */

  @Prop({ enum: ['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR', 'MANUAL'] })
  calendarProvider?: string;

  @Prop()
  calendarEventId?: string;

  @Prop({ trim: true })
  notes?: string;
}

export class AdminNote {
  @Prop({ required: true })
  adminId!: string;

  @Prop({ required: true, trim: true })
  note!: string;

  @Prop({ default: () => new Date() })
  createdAt!: Date;
}

export class StatusHistoryEntry {
  @Prop({ required: true, enum: Object.values(SetupStatus) })
  status!: SetupStatus;

  @Prop()
  changedBy?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: () => new Date() })
  changedAt!: Date;
}

@Schema({ timestamps: true, collection: 'onboarding_setups' })
export class OnboardingSetup {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  organizerId!: string;

  @Prop({ index: true })
  assignedAdminId?: string;

  // Legacy subscription-plan classification. New setups use setupPackageId
  // instead, because setup packages are an independent admin-managed catalog.
  @Prop({ enum: Object.values(PlanType) })
  packageType?: PlanType;

  @Prop({ index: true })
  setupPackageId?: string;

  @Prop({ required: true, enum: Object.values(SetupType) })
  setupType!: SetupType;

  @Prop({ required: true, enum: Object.values(SetupFeeType) })
  setupFeeType!: SetupFeeType;

  @Prop({ type: SelectedSetupPackage, _id: false })
  selectedSetupPackage?: SelectedSetupPackage;

  @Prop({
    default: SetupStatus.NOT_STARTED,
    enum: Object.values(SetupStatus),
    index: true,
  })
  status!: SetupStatus;

  @Prop({ type: SetupPayment, _id: false })
  payment!: SetupPayment;

  @Prop({ type: SetupMeeting, _id: false })
  meeting!: SetupMeeting;

  @Prop({ type: [AdminNote], _id: false })
  adminNotes!: AdminNote[];

  @Prop({ type: [StatusHistoryEntry], _id: false })
  statusHistory!: StatusHistoryEntry[];

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  createdBy?: string;

  @Prop()
  updatedBy?: string;
}

export const OnboardingSetupSchema =
  SchemaFactory.createForClass(OnboardingSetup);
OnboardingSetupSchema.index({ organizationId: 1, status: 1 });
OnboardingSetupSchema.index({ assignedAdminId: 1, status: 1 });
OnboardingSetupSchema.index(
  { 'meeting.startTime': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'meeting.status': SetupMeetingStatus.SCHEDULED,
    },
  },
);
