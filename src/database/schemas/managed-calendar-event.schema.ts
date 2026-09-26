import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { MeetingType } from '../../common/enums/meeting-type.enum';
import { MeetingUrgency } from '../../common/enums/meeting-urgency.enum';
import {
  AiActionProposal,
  AiProposalAgent,
  AiProposalAgentSchema,
} from './ai-action-proposal.schema';

export type ManagedCalendarEventDocument =
  HydratedDocument<ManagedCalendarEvent>;

@Schema({ timestamps: true, collection: 'managed_calendar_events' })
export class ManagedCalendarEvent {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true, unique: true, index: true, select: false })
  idempotencyHash!: string;

  @Prop({
    required: true,
    enum: Object.values(CalendarProviderType),
    index: true,
  })
  provider!: CalendarProviderType;

  @Prop({ index: true, sparse: true })
  providerEventId?: string;

  @Prop()
  providerEventUrl?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({
    required: true,
    enum: Object.values(MeetingType),
    default: MeetingType.OTHER,
    index: true,
  })
  meetingType!: MeetingType;

  @Prop({
    required: true,
    enum: Object.values(MeetingUrgency),
    default: MeetingUrgency.MEDIUM,
  })
  urgency!: MeetingUrgency;

  @Prop({ required: true, index: true })
  startsAt!: Date;

  @Prop({ required: true })
  endsAt!: Date;

  @Prop({ required: true })
  timezone!: string;

  @Prop({ type: [String], default: [] })
  attendees!: string[];

  @Prop({ default: 15, min: 0, max: 40320 })
  reminderMinutesBeforeStart!: number;

  @Prop({
    required: true,
    enum: Object.values(CalendarEventStatus),
    default: CalendarEventStatus.CREATING,
    index: true,
  })
  status!: CalendarEventStatus;

  @Prop()
  failureCode?: string;

  @Prop()
  failureMessage?: string;

  @Prop({ default: false, index: true })
  importedFromProvider!: boolean;

  @Prop()
  providerUpdatedAt?: Date;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ ref: AiActionProposal.name, index: true })
  aiActionProposalId?: string;

  @Prop({ type: AiProposalAgentSchema })
  proposedByAgent?: AiProposalAgent;
}

export const ManagedCalendarEventSchema =
  SchemaFactory.createForClass(ManagedCalendarEvent);
ManagedCalendarEventSchema.index({ organizationId: 1, startsAt: -1 });
ManagedCalendarEventSchema.index({
  organizationId: 1,
  status: 1,
  startsAt: 1,
});
ManagedCalendarEventSchema.index(
  { organizationId: 1, provider: 1, providerEventId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerEventId: { $type: 'string' } },
  },
);
ManagedCalendarEventSchema.index(
  { organizationId: 1, aiActionProposalId: 1 },
  {
    unique: true,
    partialFilterExpression: { aiActionProposalId: { $type: 'string' } },
  },
);
