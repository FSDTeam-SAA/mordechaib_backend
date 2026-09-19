import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { User } from '../../database/schemas/user.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { AiSourceAnalysis } from '../../database/schemas/ai-source-analysis.schema';
import {
  AiActionProposal,
  AiActionProposalStatus,
} from '../../database/schemas/ai-action-proposal.schema';
import { MessageAttachmentStatus } from '../../common/enums/message-attachment-status.enum';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';
import { UserRole } from '../../common/enums/user-role.enum';

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
    @InjectModel(User.name)
    private readonly users: Model<User>,
    @InjectModel(TaskItem.name)
    private readonly tasks: Model<TaskItem>,
    @InjectModel(ManagedCalendarEvent.name)
    private readonly calendarEvents: Model<ManagedCalendarEvent>,
    @InjectModel(PlatformMeeting.name)
    private readonly platformMeetings: Model<PlatformMeeting>,
    @InjectModel(AiSourceAnalysis.name)
    private readonly sourceAnalyses: Model<AiSourceAnalysis>,
    private readonly attachmentStorage: CloudinaryMessageAttachmentStorage,
    private readonly config: ConfigService,
  ) {}

  async sourceContext(
    sourceType: SourceType,
    sourceId: string,
    organizationId: string,
  ) {
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
      return this.messageContext(sourceId, organizationId);
    }
    if (sourceType === 'CALL_AUDIO' || sourceType === 'CALL_TRANSCRIPT') {
      return this.callContext(sourceType, sourceId, organizationId);
    }
    return this.meetingContext(sourceType, sourceId, organizationId);
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

  async requesterContext(organizationId: string, userId?: string) {
    if (!userId || !isValidObjectId(userId)) return undefined;
    const user = await this.users
      .findOne(
        { _id: userId, organizationId },
        { firstName: 1, lastName: 1, timezone: 1, language: 1 },
      )
      .lean()
      .exec();
    if (!user) return undefined;
    return {
      userId: String(user._id),
      name: `${user.firstName} ${user.lastName}`.trim(),
      timezone: user.timezone,
      language: user.language,
    };
  }

  private async meetingContext(
    sourceType: SourceType,
    sourceId: string,
    organizationId: string,
  ) {
    if (!isValidObjectId(sourceId)) {
      throw new BadRequestException(
        'Meeting sourceId must be a MongoDB ObjectId',
      );
    }
    const meeting = await this.meetingBots
      .findOne({ _id: sourceId, organizationId })
      .lean()
      .exec();
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
        .findOne({ _id: sourceId, organizationId })
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

  private async callContext(
    sourceType: SourceType,
    sourceId: string,
    organizationId: string,
  ) {
    const filters: Array<Record<string, string>> = [
      { recordingSid: sourceId },
      { callSid: sourceId },
    ];
    if (isValidObjectId(sourceId)) filters.push({ _id: sourceId });
    const recording = await this.callRecordings
      .findOne({ organizationId, $or: filters })
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

  private async messageContext(sourceId: string, organizationId: string) {
    if (!isValidObjectId(sourceId)) {
      throw new BadRequestException(
        'User message sourceId must be a MongoDB ObjectId',
      );
    }
    const message = await this.messages
      .findOne({
        _id: sourceId,
        organizationId,
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
    const attachmentDownloadsEnabled = this.config.get<boolean>(
      'aiService.attachmentDownloadUrlEnabled',
      false,
    );
    const attachments = await this.attachments
      .find({
        organizationId: message.organizationId,
        messageId: { $in: messageIds },
        status: MessageAttachmentStatus.ACTIVE,
      })
      .select(
        `+extractedText +transcription${
          attachmentDownloadsEnabled
            ? ' +storageKey +storageAssetId +storageResourceType +storageDeliveryType +storageFormat'
            : ''
        }`,
      )
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();
    const attachmentContext = await Promise.all(
      attachments.map((attachment) =>
        this.attachmentData(attachment, attachmentDownloadsEnabled),
      ),
    );
    const requester = await this.users
      .findOne(
        { _id: message.senderId, organizationId: message.organizationId },
        { role: 1 },
      )
      .lean()
      .exec();
    if (!requester) throw new NotFoundException('Message requester not found');
    const canReadRestrictedFacts = [UserRole.OWNER, UserRole.ADMIN].includes(
      requester.role,
    );
    const pendingProposals = canReadRestrictedFacts
      ? await this.proposals
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
          .select(
            'proposalId actionType status payload clarificationQuestions clarificationAnswers requestId proposedByAgent revision createdAt updatedAt',
          )
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
          .exec()
      : [];
    const facts = await this.chatFacts(
      String(message.organizationId),
      canReadRestrictedFacts,
      pendingProposals,
    );

    return {
      organizationId: message.organizationId,
      requesterUserId: message.senderId,
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
      facts,
    };
  }

  private async attachmentData(
    attachment: MessageAttachment & Record<string, unknown>,
    downloadsEnabled: boolean,
  ) {
    const extractedText =
      typeof attachment.extractedText === 'string' &&
      attachment.extractedText.trim()
        ? attachment.extractedText
        : undefined;
    const transcription =
      typeof attachment.transcription === 'string' &&
      attachment.transcription.trim()
        ? attachment.transcription
        : undefined;
    let download: { downloadUrl: string; expiresAt: Date | string } | undefined;
    if (downloadsEnabled) {
      try {
        download = await this.attachmentStorage.getDownload(
          {
            storageKey: attachment.storageKey,
            storageAssetId: attachment.storageAssetId,
            storageResourceType: attachment.storageResourceType,
            storageDeliveryType: attachment.storageDeliveryType,
            storageFormat: attachment.storageFormat,
          },
          'inline',
        );
      } catch {
        download = undefined;
      }
    }
    return {
      id: String(attachment._id),
      messageId: attachment.messageId,
      category: attachment.category,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      processingStatus: attachment.processingStatus,
      ...(typeof attachment.processingError === 'string'
        ? { processingError: attachment.processingError }
        : {}),
      contentAvailability:
        extractedText || transcription
          ? 'AVAILABLE'
          : download
            ? 'DOWNLOAD_AVAILABLE'
            : 'UNAVAILABLE',
      ...(extractedText ? { extractedText } : {}),
      ...(transcription ? { transcription } : {}),
      ...(download
        ? {
            downloadUrl: download.downloadUrl,
            downloadUrlExpiresAt: download.expiresAt,
          }
        : {
            contentUnavailableReason:
              typeof attachment.processingError === 'string'
                ? attachment.processingError
                : 'No extracted text or transcription is available',
          }),
    };
  }

  private async chatFacts(
    organizationId: string,
    canReadRestrictedFacts: boolean,
    pendingProposals: Array<Record<string, unknown>>,
  ) {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [tasks, calendarEvents, meetings, analyses] = await Promise.all([
      this.tasks
        .find({ organizationId })
        .select(
          'title description status priority department assignedToUserId dueDate tags createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .limit(20)
        .lean()
        .exec(),
      this.calendarEvents
        .find({ organizationId, startsAt: { $gte: from, $lt: to } })
        .select(
          'title meetingType urgency startsAt endsAt timezone status createdAt updatedAt',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(20)
        .lean()
        .exec(),
      canReadRestrictedFacts
        ? this.platformMeetings
            .find({ organizationId, startsAt: { $gte: from, $lt: to } })
            .select(
              'title agenda platform startsAt endsAt durationMinutes timezone status createdAt updatedAt',
            )
            .sort({ startsAt: 1, _id: 1 })
            .limit(20)
            .lean()
            .exec()
        : Promise.resolve([]),
      canReadRestrictedFacts
        ? this.sourceAnalyses
            .find({ organizationId })
            .select(
              'source summary overallConfidence sentimentAnalysis customerIntelligence patternDetection createdAt updatedAt',
            )
            .sort({ updatedAt: -1, _id: -1 })
            .limit(10)
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    return {
      tasks: {
        availability: 'AVAILABLE',
        items: tasks.map((task) =>
          this.factItem('TASK', task, {
            title: task.title,
            description: this.boundedText(task.description, 2000),
            status: task.status,
            priority: task.priority,
            department: task.department,
            assignedToUserId: task.assignedToUserId,
            dueDate: task.dueDate,
            tags: Array.isArray(task.tags) ? task.tags.slice(0, 20) : [],
          }),
        ),
      },
      meetings: {
        availability: canReadRestrictedFacts ? 'AVAILABLE' : 'UNAVAILABLE',
        items: meetings.map((meeting) =>
          this.factItem('PLATFORM_MEETING', meeting, {
            title: meeting.title,
            agenda: this.boundedText(meeting.agenda, 2000),
            platform: meeting.platform,
            startsAt: meeting.startsAt,
            endsAt: meeting.endsAt,
            durationMinutes: meeting.durationMinutes,
            timezone: meeting.timezone,
            status: meeting.status,
          }),
        ),
      },
      calendarEvents: {
        availability: 'AVAILABLE',
        items: calendarEvents.map((event) =>
          this.factItem('CALENDAR_EVENT', event, {
            title: event.title,
            meetingType: event.meetingType,
            urgency: event.urgency,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timezone: event.timezone,
            status: event.status,
          }),
        ),
      },
      actionProposals: {
        availability: canReadRestrictedFacts ? 'AVAILABLE' : 'UNAVAILABLE',
        items: pendingProposals.map((proposal) =>
          this.factItem('AI_ACTION_PROPOSAL', proposal, {
            proposalId: proposal.proposalId,
            actionType: proposal.actionType,
            status: proposal.status,
            payload: proposal.payload,
            clarificationQuestions: proposal.clarificationQuestions,
            clarificationAnswers: proposal.clarificationAnswers,
            proposedByAgent: proposal.proposedByAgent,
            revision: proposal.revision,
          }),
        ),
      },
      sourceAnalyses: {
        availability: canReadRestrictedFacts ? 'PARTIAL' : 'UNAVAILABLE',
        items: analyses.map((analysis) =>
          this.factItem('AI_SOURCE_ANALYSIS', analysis, {
            source: analysis.source,
            summary: this.boundedText(analysis.summary, 2000),
            overallConfidence: analysis.overallConfidence,
            sentimentAnalysis: analysis.sentimentAnalysis,
            customerIntelligence: analysis.customerIntelligence,
            patternDetection: analysis.patternDetection,
          }),
        ),
      },
    };
  }

  private factItem(
    sourceType: string,
    source: Record<string, unknown>,
    data: Record<string, unknown>,
  ) {
    return {
      id: `${sourceType.toLowerCase()}-${String(source._id)}`,
      sourceType,
      sourceId: String(source._id),
      capturedAt: source.updatedAt || source.createdAt,
      data,
    };
  }

  private boundedText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
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
      requesterUserId:
        typeof meeting.createdByUserId === 'string'
          ? meeting.createdByUserId
          : undefined,
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
