import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { IntegrationSetupStatus } from '../../common/enums/integration-setup-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { SetupPaymentStatus } from '../../common/enums/setup-payment-status.enum';
import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';

export type OnboardingSetupDocument = HydratedDocument<OnboardingSetup>;

export class SelectedSetupPackage {
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

  @Prop({ enum: ['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR', 'MANUAL'] })
  calendarProvider?: string;

  @Prop()
  calendarEventId?: string;

  @Prop({ trim: true })
  notes?: string;
}

export class SetupRequirements {
  @Prop({ trim: true })
  businessName?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  industry?: string;

  @Prop({ min: 1 })
  teamSize?: number;

  @Prop({ trim: true })
  message?: string;

  @Prop({ enum: ['HUBSPOT', 'SALESFORCE', 'OTHER', 'NONE'], default: 'NONE' })
  crmProvider?: string;

  @Prop({
    enum: ['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR', 'NONE'],
    default: 'NONE',
  })
  calendarProvider?: string;

  @Prop({ enum: ['TWILIO', 'NONE'], default: 'NONE' })
  callingProvider?: string;

  @Prop({ default: false })
  needCrmMigration!: boolean;

  @Prop({ default: false })
  needCalendarSetup!: boolean;

  @Prop({ default: false })
  needTwilioSetup!: boolean;

  @Prop({ default: false })
  needAiAgentSetup!: boolean;

  @Prop({ default: false })
  needWorkflowSetup!: boolean;

  @Prop({ default: false })
  needTeamOnboarding!: boolean;
}

export class SetupSectionProgress {
  @Prop({
    default: IntegrationSetupStatus.PENDING,
    enum: Object.values(IntegrationSetupStatus),
  })
  status!: IntegrationSetupStatus;

  @Prop({ trim: true })
  note?: string;

  @Prop()
  completedAt?: Date;
}

export class SetupProgress {
  @Prop({ default: 0, min: 0, max: 100 })
  overallProgress!: number;

  @Prop({ type: SetupSectionProgress, _id: false })
  crmSetup!: SetupSectionProgress;

  @Prop({ type: SetupSectionProgress, _id: false })
  calendarSetup!: SetupSectionProgress;

  @Prop({ type: SetupSectionProgress, _id: false })
  twilioSetup!: SetupSectionProgress;

  @Prop({ type: SetupSectionProgress, _id: false })
  aiAgentSetup!: SetupSectionProgress;

  @Prop({ type: SetupSectionProgress, _id: false })
  workflowSetup!: SetupSectionProgress;

  @Prop({ type: SetupSectionProgress, _id: false })
  teamOnboarding!: SetupSectionProgress;
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

  @Prop({ required: true, enum: Object.values(PlanType) })
  packageType!: PlanType;

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

  @Prop({ type: SetupRequirements, _id: false })
  requirements?: SetupRequirements;

  @Prop({ type: SetupProgress, _id: false })
  progress!: SetupProgress;

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