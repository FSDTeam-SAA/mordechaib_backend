import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';

export type OAuthConnectionProvider =
  MeetingPlatform | CalendarProviderType.OUTLOOK_CALENDAR;

export type MeetingOAuthStateDocument = HydratedDocument<MeetingOAuthState>;

@Schema({ timestamps: true, collection: 'meeting_oauth_states' })
export class MeetingOAuthState {
  @Prop({ required: true, unique: true, index: true, select: false })
  nonceHash!: string;

  @Prop({
    required: true,
    enum: [
      ...Object.values(MeetingPlatform),
      CalendarProviderType.OUTLOOK_CALENDAR,
    ],
    index: true,
  })
  platform!: OAuthConnectionProvider;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  consumedAt?: Date;
}

export const MeetingOAuthStateSchema =
  SchemaFactory.createForClass(MeetingOAuthState);
MeetingOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
