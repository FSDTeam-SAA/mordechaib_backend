import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CallRecording,
  CallRecordingSchema,
} from '../../database/schemas/call-recording.schema';
import {
  MeetingBot,
  MeetingBotSchema,
} from '../../database/schemas/meeting-bot.schema';
import {
  MeetingTranscript,
  MeetingTranscriptSchema,
} from '../../database/schemas/meeting-transcript.schema';
import {
  Organization,
  OrganizationSchema,
} from '../../database/schemas/organization.schema';
import {
  ZoomMeeting,
  ZoomMeetingSchema,
} from '../../database/schemas/zoom-meeting.schema';
import {
  ZoomMeetingTranscript,
  ZoomMeetingTranscriptSchema,
} from '../../database/schemas/zoom-meeting-transcript.schema';
import { AiSourceContextService } from './ai-source-context.service';
import {
  Conversation,
  ConversationSchema,
} from '../../database/schemas/conversation.schema';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import {
  MessageAttachment,
  MessageAttachmentSchema,
} from '../../database/schemas/message-attachment.schema';
import {
  AiActionProposal,
  AiActionProposalSchema,
} from '../../database/schemas/ai-action-proposal.schema';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: MeetingBot.name, schema: MeetingBotSchema },
      { name: MeetingTranscript.name, schema: MeetingTranscriptSchema },
      { name: ZoomMeeting.name, schema: ZoomMeetingSchema },
      { name: ZoomMeetingTranscript.name, schema: ZoomMeetingTranscriptSchema },
      { name: CallRecording.name, schema: CallRecordingSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: MessageAttachment.name, schema: MessageAttachmentSchema },
      { name: AiActionProposal.name, schema: AiActionProposalSchema },
    ]),
  ],
  providers: [AiSourceContextService, CloudinaryMessageAttachmentStorage],
  exports: [AiSourceContextService],
})
export class AiSourceContextModule {}
