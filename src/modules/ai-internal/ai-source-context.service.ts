import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { CallRecording } from '../../database/schemas/call-recording.schema';
import { MeetingBot } from '../../database/schemas/meeting-bot.schema';
import { MeetingTranscript } from '../../database/schemas/meeting-transcript.schema';
import { Organization } from '../../database/schemas/organization.schema';
import { ZoomMeeting } from '../../database/schemas/zoom-meeting.schema';
import { ZoomMeetingTranscript } from '../../database/schemas/zoom-meeting-transcript.schema';
import { Conversation } from '../../database/schemas/conversation.schema';
import { Message } from '../../database/schemas/message.schema';
import { MessageAttachment } from '../../database/schemas/message-attachment.schema';
import {
  AiActionProposal,
  AiActionProposalStatus,
} from '../../database/schemas/ai-action-proposal.schema';
import { MessageAttachmentStatus } from '../../common/enums/message-attachment-status.enum';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';

type SourceType =
  | 'CALL_AUDIO'
  | 'CALL_TRANSCRIPT'
  | 'ZOOM_MEETING'
  | 'GOOGLE_MEET'
  | 'USER_MESSAGE';

type MessageContextRecord = Record<string, unknown>;

@Injectable()
export class AiSourceContextService {
  constructor(
    @InjectModel(MeetingBot.name)
    private readonly meetingBots: Model<MeetingBot>,
    @InjectModel(MeetingTranscript.name)
    private readonly meetingTranscripts: Model<MeetingTranscript>,
    @InjectModel(ZoomMeeting.name)
    private readonly zoomMeetings: Model<ZoomMeeting>,
    @InjectModel(ZoomMeetingTranscript.name)
    private readonly zoomTranscripts: Model<ZoomMeetingTranscript>,
    @InjectModel(CallRecording.name)
    private readonly callRecordings: Model<CallRecording>,
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    @InjectModel(Message.name)
    private readonly messages: Model<Message>,
    @InjectModel(MessageAttachment.name)
    private readonly attachments: Model<MessageAttachment>,
    @InjectModel(AiActionProposal.name)
    private readonly proposals: Model<AiActionProposal>,
    private readonly attachmentStorage: CloudinaryMessageAttachmentStorage,
  ) {}

  async sourceContext(sourceType: SourceType, sourceId: string) {
    if (
      ![
        'CALL_AUDIO',
        'CALL_TRANSCRIPT',
        'ZOOM_MEETING',
        'GOOGLE_MEET',
        'USER_MESSAGE',
      ].includes(sourceType)
    ) {
      throw new BadRequestException('Unsupported AI source type');
    }
    if (sourceType === 'USER_MESSAGE') {
      return this.messageContext(sourceId);
    }
    if (sourceType === 'CALL_AUDIO' || sourceType === 'CALL_TRANSCRIPT') {
      return this.callContext(sourceType, sourceId);
    }
    return this.meetingContext(sourceType, sourceId);
  }

  async markMessageProcessed(
    organizationId: string,
    messageId: string,
    status: 'COMPLETED' | 'FAILED',
    error?: string,
  ) {
    await this.messages
      .updateOne(
        {
          _id: messageId,
          organizationId,
          deletedAt: { $exists: false },
        },
        {
          $set: {
            processingStatus: status,
            processedAt: new Date(),
            ...(status === 'FAILED'
              ? { aiError: (error || 'AI processing failed').slice(0, 500) }
              : {}),
          },
          ...(status === 'COMPLETED' ? { $unset: { aiError: 1 } } : {}),
        },
      )
      .exec();
  }

  async organizationContext(organizationId: string) {
    if (!isValidObjectId(organizationId)) {
      throw new BadRequestException('Invalid organization id');
    }
    const organization = await this.organizations
      .findById(organizationId, {
        name: 1,
        timezone: 1,
        language: 1,
        industry: 1,
        businessSize: 1,
        businessHours: 1,
      })
      .lean()
      .exec();
    if (!organization) throw new NotFoundException('Organization not found');
    return {
      organizationId: String(organization._id),
      name: organization.name,
      timezone: organization.timezone,
      language: organization.language,
      industry: organization.industry,
      businessSize: organization.businessSize,
      businessHours: organization.businessHours,
    };
  }

  private async meetingContext(sourceType: SourceType, sourceId: string) {
    if (!isValidObjectId(sourceId)) {
      throw new BadRequestException(
        'Meeting sourceId must be a MongoDB ObjectId',
      );
    }
    const meeting = await this.meetingBots.findById(sourceId).lean().exec();
    const expectedPlatform =
      sourceType === 'GOOGLE_MEET' ? 'GOOGLE_MEET' : 'ZOOM';
    if (meeting && meeting.platform === expectedPlatform) {
      const transcript = await this.meetingTranscripts
        .findOne({
          meetingId: sourceId,
          organizationId: meeting.organizationId,
        })
        .lean()
        .exec();
      return this.toMeetingContext(sourceType, sourceId, meeting, transcript);
    }

    if (sourceType === 'ZOOM_MEETING') {
      const legacyMeeting = await this.zoomMeetings
        .findById(sourceId)
        .lean()
        .exec();
      if (legacyMeeting) {
        const transcript = await this.zoomTranscripts
          .findOne({
            meetingId: sourceId,
            organizationId: legacyMeeting.organizationId,
          })
          .lean()
          .exec();
        return this.toMeetingContext(
          sourceType,
          sourceId,
          legacyMeeting,
          transcript,
        );
      }
    }
    throw new NotFoundException('Meeting source not found');
  }

  private async callContext(sourceType: SourceType, sourceId: string) {
    const filters: Array<Record<string, string>> = [
      { recordingSid: sourceId },
      { callSid: sourceId },
    ];
    if (isValidObjectId(sourceId)) filters.push({ _id: sourceId });
    const recording = await this.callRecordings
      .findOne({ $or: filters })
      .lean()
      .exec();
    if (!recording) throw new NotFoundException('Call source not found');
    return {
      organizationId: recording.organizationId,
      source: { type: sourceType, id: sourceId },
      occurredAt: (recording as { createdAt?: Date }).createdAt,
      call: {
        callSid: recording.callSid,
        recordingSid: recording.recordingSid,
        recordingDuration: recording.recordingDuration,
        recordingChannels: recording.recordingChannels,
        audioAvailable: Boolean(recording.localFilePath),
      },
      transcript: recording.transcriptText
        ? { text: recording.transcriptText, segments: [] }
        : null,
    };
  }

  private async messageContext(sourceId: string) {
    if (!isValidObjectId(sourceId)) {
      throw new BadRequestException(
        'User message sourceId must be a MongoDB ObjectId',
      );
    }
    const message = await this.messages
      .findOne({
        _id: sourceId,
        deletedAt: { $exists: false },
      })
      .select('+extractedText +transcription')
      .lean()
      .exec();
    if (!message) throw new NotFoundException('Message source not found');

    const conversation = await this.conversations
      .findOne({
        _id: message.conversationId,
        organizationId: message.organizationId,
        status: 'ACTIVE',
      })
      .lean()
      .exec();
    if (!conversation) throw new NotFoundException('Conversation not found');

    const history = await this.messages
      .find({
        organizationId: message.organizationId,
        conversationId: message.conversationId,
        deletedAt: { $exists: false },
      })
      .select('+extractedText +transcription')
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean()
      .exec();
    const messageIds = history.map((item) => String(item._id));
    const attachments = await this.attachments
      .find({
        organizationId: message.organizationId,
        messageId: { $in: messageIds },
        status: MessageAttachmentStatus.ACTIVE,
      })
      .select(
        '+storageKey +storageAssetId +storageResourceType +storageDeliveryType +storageFormat +extractedText +transcription',
      )
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();
    const attachmentContext = await Promise.all(
      attachments.map(async (attachment) => {
        const download = await this.attachmentStorage.getDownload(
          {
            storageKey: attachment.storageKey,
            storageAssetId: attachment.storageAssetId,
            storageResourceType: attachment.storageResourceType,
            storageDeliveryType: attachment.storageDeliveryType,
            storageFormat: attachment.storageFormat,
          },
          'inline',
        );
        return {
          id: String(attachment._id),
          messageId: attachment.messageId,
          category: attachment.category,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          processingStatus: attachment.processingStatus,
          extractedText: attachment.extractedText,
          transcription: attachment.transcription,
          downloadUrl: download.downloadUrl,
          downloadUrlExpiresAt: download.expiresAt,
        };
      }),
    );
    const pendingProposals = await this.proposals
      .find({
        organizationId: message.organizationId,
        conversationId: message.conversationId,
        status: {
          $in: [
            AiActionProposalStatus.NEEDS_CLARIFICATION,
            AiActionProposalStatus.ANALYZING,
            AiActionProposalStatus.PENDING,
          ],
        },
      })
      .select('proposalId actionType status payload clarificationQuestions clarificationAnswers requestId proposedByAgent revision')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();

    return {
      organizationId: message.organizationId,
      source: { type: 'USER_MESSAGE', id: sourceId },
      occurredAt: (message as unknown as MessageContextRecord).createdAt,
      conversationId: message.conversationId,
      latestMessageId: history.length ? String(history[0]._id) : sourceId,
      message: this.messageData(message as unknown as MessageContextRecord),
      conversation: {
        id: String(conversation._id),
        title: conversation.title,
        totalMessageCount: conversation.totalMessageCount,
        history: history
          .reverse()
          .map((item) =>
            this.messageData(item as unknown as MessageContextRecord),
          ),
      },
      attachments: attachmentContext,
      pendingProposals,
    };
  }

  private messageData(message: MessageContextRecord) {
    return {
      id: String(message._id),
      senderType: message.senderType,
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      processingStatus: message.processingStatus,
      extractedText: message.extractedText,
      transcription: message.transcription,
      createdAt: message.createdAt,
    };
  }

  private toMeetingContext(
    sourceType: SourceType,
    sourceId: string,
    meeting: Record<string, unknown>,
    transcript: Record<string, unknown> | null,
  ) {
    const segments = Array.isArray(transcript?.segments)
      ? transcript.segments
      : [];
    const participants = [
      ...new Set(
        segments
          .map((segment) => this.speaker(segment))
          .filter((speaker): speaker is string => Boolean(speaker)),
      ),
    ];
    return {
      organizationId: String(meeting.organizationId),
      source: { type: sourceType, id: sourceId },
      occurredAt:
        meeting.transcriptCompletedAt || meeting.joinAt || meeting.createdAt,
      meeting: {
        platform: meeting.platform || 'ZOOM',
        participants,
        transcriptAvailable: Boolean(transcript),
      },
      transcript: transcript
        ? {
            text: transcript.transcriptText,
            segments,
            wordCount: transcript.wordCount,
            languageCode: transcript.languageCode,
          }
        : null,
    };
  }

  private speaker(value: unknown) {
    if (!value || typeof value !== 'object') return undefined;
    const segment = value as Record<string, unknown>;
    const participant =
      segment.participant && typeof segment.participant === 'object'
        ? (segment.participant as Record<string, unknown>)
        : undefined;
    return (
      (typeof participant?.name === 'string' && participant.name) ||
      (typeof participant?.id === 'string' && participant.id) ||
      (typeof segment.speaker === 'string' && segment.speaker) ||
      undefined
    );
  }
}
