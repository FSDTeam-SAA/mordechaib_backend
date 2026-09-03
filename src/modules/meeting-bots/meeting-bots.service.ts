import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import { MeetingBotStatus } from '../../common/enums/meeting-bot-status.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { CreatePlatformMeetingDto } from './dto/create-platform-meeting.dto';
import { ListMeetingBotsQueryDto } from './dto/list-meeting-bots-query.dto';
import { UpdateMeetingBotDto } from './dto/update-meeting-bot.dto';
import {
  normalizeMeetingUrl,
  parseMeetingUrl,
} from './helpers/meeting-url.helper';
import {
  mapRecallBotStatus,
  recallFailure,
} from './helpers/recall-status.mapper';
import { MeetingBotsQueue } from './meeting-bots.queue';
import { MeetingBotsRepository } from './meeting-bots.repository';
import { RecallMeetingProvider } from './providers/recall-meeting.provider';
import {
  RecallApiError,
  RecallRecording,
  RecallWebhookPayload,
} from './providers/recall.types';
import {
  MEETING_AUDIO_STORAGE,
  MeetingAudioStorage,
} from './storage/meeting-audio-storage.interface';
import { ZoomAuthService } from './zoom-auth.service';

@Injectable()
export class MeetingBotsService {
  constructor(
    private readonly repository: MeetingBotsRepository,
    private readonly provider: RecallMeetingProvider,
    private readonly queue: MeetingBotsQueue,
    private readonly zoomAuth: ZoomAuthService,
    private readonly config: ConfigService,
    @Inject(MEETING_AUDIO_STORAGE)
    private readonly audioStorage: MeetingAudioStorage,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    platform: MeetingPlatform,
    input: CreatePlatformMeetingDto,
  ) {
    this.assertRecallConfigured();
    parseMeetingUrl(input.meetingUrl, platform);
    const joinAt = input.joinAt ? new Date(input.joinAt) : undefined;
    if (joinAt && joinAt.getTime() <= Date.now()) {
      throw new BadRequestException('joinAt must be in the future');
    }
    if (platform === MeetingPlatform.ZOOM) {
      await this.zoomAuth.assertConnected(organizationId);
    }

    const meetingUrlHash = this.hash(
      normalizeMeetingUrl(input.meetingUrl, platform),
    );
    const activeMeetingKey = this.hash(
      `${platform}|${organizationId}|${meetingUrlHash}|${joinAt?.toISOString() || 'AD_HOC'}`,
    );
    const deduplicationKey = this.hash(
      input.idempotencyKey
        ? `${platform}|${organizationId}|client|${input.idempotencyKey}`
        : `${activeMeetingKey}|request|${crypto.randomUUID()}`,
    );
    const duplicate = await this.repository.findDuplicate(
      deduplicationKey,
      activeMeetingKey,
    );
    if (duplicate) return { ...duplicate, duplicate: true };

    const [globalActive, organizationActive] = await Promise.all([
      this.repository.countActive(),
      this.repository.countActive(organizationId),
    ]);
    if (globalActive >= this.maxConcurrentMeetings) {
      throw new HttpException(
        'The global concurrent meeting bot limit has been reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (organizationActive >= this.maxConcurrentMeetingsPerOrganization) {
      throw new HttpException(
        'The organization concurrent meeting bot limit has been reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result = await this.repository.createOrFind({
      platform,
      organizationId,
      createdByUserId: userId,
      deduplicationKey,
      activeMeetingKey,
      meetingUrlHash,
      meetingUrlEncrypted: encryptText(input.meetingUrl, this.encryptionKey),
      joinAt,
      botName: input.botName || this.defaultBotName,
      metadata: input.metadata,
    });

    if (result.created && result.meeting) {
      try {
        await this.queue.enqueueBotCreation(String(result.meeting._id));
      } catch {
        await this.repository.updateById(String(result.meeting._id), {
          status: MeetingBotStatus.FAILED,
          failureCode: 'QUEUE_UNAVAILABLE',
          failureMessage: 'The meeting bot job could not be queued',
        });
        throw new ServiceUnavailableException(
          'The meeting bot could not be queued',
        );
      }
    }
    return { ...result.meeting, duplicate: !result.created };
  }

  list(
    organizationId: string,
    query: ListMeetingBotsQueryDto,
    requiredPlatform?: MeetingPlatform,
  ) {
    return this.repository.list(
      organizationId,
      query.page,
      query.limit,
      query.status,
      requiredPlatform || query.platform,
    );
  }

  async get(
    organizationId: string,
    id: string,
    requiredPlatform?: MeetingPlatform,
  ) {
    this.assertObjectId(id);
    const meeting = await this.repository.findByIdForOrganization(
      id,
      organizationId,
      requiredPlatform,
    );
    if (!meeting) throw new NotFoundException('Meeting bot not found');
    return meeting;
  }

  async getTranscript(
    organizationId: string,
    id: string,
    requiredPlatform?: MeetingPlatform,
  ) {
    await this.get(organizationId, id, requiredPlatform);
    const transcript = await this.repository.findTranscript(id, organizationId);
    if (!transcript) {
      throw new NotFoundException('Meeting transcript is not ready');
    }
    return transcript;
  }

  async getAudio(
    organizationId: string,
    id: string,
    requiredPlatform?: MeetingPlatform,
  ) {
    this.assertObjectId(id);
    const meeting = await this.repository.findInternalById(id);
    if (
      !meeting ||
      meeting.organizationId !== organizationId ||
      (requiredPlatform && meeting.platform !== requiredPlatform)
    ) {
      throw new NotFoundException('Meeting bot not found');
    }
    const reference = meeting.audioStorageReference || meeting.recordingId;
    if (!reference) throw new NotFoundException('Meeting audio is not ready');

    try {
      const audio = await this.audioStorage.getDownload(reference);
      if (audio.expiresAt) {
        await this.repository.updateById(id, {
          mediaExpiresAt: audio.expiresAt,
        });
      }
      return audio;
    } catch (error) {
      if (
        error instanceof RecallApiError &&
        [404, 410].includes(error.status)
      ) {
        throw new NotFoundException(
          'Meeting audio is unavailable or has expired',
        );
      }
      throw error;
    }
  }

  async updateScheduled(
    organizationId: string,
    id: string,
    input: UpdateMeetingBotDto,
    requiredPlatform?: MeetingPlatform,
  ) {
    if (!input.meetingUrl && !input.joinAt && !input.botName) {
      throw new BadRequestException('At least one update field is required');
    }
    this.assertObjectId(id);
    const meeting = await this.repository.findInternalById(id);
    if (
      !meeting ||
      meeting.organizationId !== organizationId ||
      (requiredPlatform && meeting.platform !== requiredPlatform)
    ) {
      throw new NotFoundException('Meeting bot not found');
    }
    if (
      ![MeetingBotStatus.PENDING, MeetingBotStatus.SCHEDULED].includes(
        meeting.status,
      )
    ) {
      throw new ConflictException(
        'Only pending or scheduled meeting bots can be updated',
      );
    }

    const joinAt = input.joinAt ? new Date(input.joinAt) : meeting.joinAt;
    if (joinAt && joinAt.getTime() <= Date.now() + 10 * 60 * 1000) {
      throw new BadRequestException(
        'A scheduled meeting must remain at least 10 minutes in the future',
      );
    }
    const meetingUrl =
      input.meetingUrl ||
      decryptText(meeting.meetingUrlEncrypted, this.encryptionKey);
    parseMeetingUrl(meetingUrl, meeting.platform);
    const meetingUrlHash = this.hash(
      normalizeMeetingUrl(meetingUrl, meeting.platform),
    );
    const activeMeetingKey = this.hash(
      `${meeting.platform}|${organizationId}|${meetingUrlHash}|${joinAt?.toISOString() || 'AD_HOC'}`,
    );
    const duplicate =
      await this.repository.findByActiveMeetingKey(activeMeetingKey);
    if (duplicate && String(duplicate._id) !== id) {
      throw new ConflictException(
        'A bot already exists for this meeting occurrence',
      );
    }

    if (meeting.recallBotId) {
      await this.provider.updateScheduledBot(meeting.recallBotId, {
        meetingUrl: input.meetingUrl,
        joinAt: input.joinAt ? joinAt : undefined,
        botName: input.botName,
      });
    }
    return this.repository.updateById(id, {
      ...(input.meetingUrl
        ? {
            meetingUrlEncrypted: encryptText(meetingUrl, this.encryptionKey),
            meetingUrlHash,
          }
        : {}),
      ...(input.joinAt ? { joinAt } : {}),
      ...(input.botName ? { botName: input.botName } : {}),
      ...(input.meetingUrl || input.joinAt ? { activeMeetingKey } : {}),
    });
  }

  async cancel(
    organizationId: string,
    id: string,
    requiredPlatform?: MeetingPlatform,
  ) {
    const meeting = await this.get(organizationId, id, requiredPlatform);
    if (meeting.status === MeetingBotStatus.CANCELLED) return meeting;
    if (
      ![
        MeetingBotStatus.PENDING,
        MeetingBotStatus.CREATING,
        MeetingBotStatus.SCHEDULED,
        MeetingBotStatus.JOINING,
        MeetingBotStatus.WAITING_ROOM,
      ].includes(meeting.status)
    ) {
      throw new ConflictException(
        'This meeting bot can no longer be cancelled',
      );
    }
    if (meeting.recallBotId) {
      if (
        [MeetingBotStatus.JOINING, MeetingBotStatus.WAITING_ROOM].includes(
          meeting.status,
        )
      ) {
        await this.provider.removeBotFromCall(meeting.recallBotId);
      } else {
        await this.provider.deleteScheduledBot(meeting.recallBotId);
      }
    }
    return this.repository.updateById(id, {
      status: MeetingBotStatus.CANCELLED,
    });
  }

  async leave(
    organizationId: string,
    id: string,
    requiredPlatform?: MeetingPlatform,
  ) {
    const meeting = await this.get(organizationId, id, requiredPlatform);
    if (!meeting.recallBotId) {
      throw new ConflictException('The Recall bot has not been created');
    }
    if (
      ![
        MeetingBotStatus.JOINING,
        MeetingBotStatus.WAITING_ROOM,
        MeetingBotStatus.IN_CALL,
        MeetingBotStatus.RECORDING,
      ].includes(meeting.status)
    ) {
      throw new ConflictException('The Recall bot is not in the meeting');
    }
    await this.provider.removeBotFromCall(meeting.recallBotId);
    return { leaving: true, recallBotId: meeting.recallBotId };
  }

  async processBotCreation(meetingId: string) {
    const meeting = await this.repository.claimBotCreation(meetingId);
    if (!meeting) return;
    const meetingUrl = decryptText(
      meeting.meetingUrlEncrypted,
      this.encryptionKey,
    );
    const meetingIdValue = String(meeting._id);
    let existingBot = await this.provider.findBotByMetadata(
      'meeting_bot_id',
      meetingIdValue,
    );
    if (!existingBot && meeting.platform === MeetingPlatform.ZOOM) {
      existingBot = await this.provider.findBotByMetadata(
        'zoom_meeting_id',
        meetingIdValue,
      );
    }
    const bot =
      existingBot ||
      (await this.provider.createBot({
        platform: meeting.platform,
        meetingUrl,
        joinAt: meeting.joinAt,
        botName: meeting.botName,
        retentionHours: this.retentionHours,
        consentMessage: this.consentMessage,
        zoomZakUrl:
          meeting.platform === MeetingPlatform.ZOOM &&
          this.zoomAuth.signedInEnabled
            ? this.zoomAuth.createZakCallbackUrl(meeting.organizationId)
            : undefined,
        googleMeetLoginGroupId:
          meeting.platform === MeetingPlatform.GOOGLE_MEET
            ? this.googleMeetLoginGroupId
            : undefined,
        metadata: {
          meeting_bot_id: meetingIdValue,
          platform: meeting.platform,
          organization_id: meeting.organizationId,
          user_id: meeting.createdByUserId,
        },
      }));
    const scheduled =
      !!meeting.joinAt &&
      meeting.joinAt.getTime() > Date.now() + 10 * 60 * 1000;
    const attached = await this.repository.attachBotIfPending(
      meetingId,
      bot.id,
      scheduled ? MeetingBotStatus.SCHEDULED : MeetingBotStatus.JOINING,
    );
    if (!attached) {
      if (scheduled) await this.provider.deleteScheduledBot(bot.id);
      else await this.provider.removeBotFromCall(bot.id);
    }
  }

  markBotCreationFailed(meetingId: string, error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Recall bot creation failed';
    return this.repository.markBotCreationFailedIfPending(
      meetingId,
      'BOT_CREATION_FAILED',
      message.slice(0, 1000),
    );
  }

  async processWebhook(eventId: string, payload: RecallWebhookPayload) {
    if (!payload.event || typeof payload.event !== 'string') {
      throw new BadRequestException('Recall webhook event is required');
    }
    const claim = await this.repository.claimWebhookEvent(
      eventId,
      payload.event,
    );
    if (!claim.claimed) return;
    try {
      await this.dispatchWebhook(payload);
      await this.repository.completeWebhookEvent(eventId);
    } catch (error) {
      await this.repository.failWebhookEvent(
        eventId,
        error instanceof Error ? error.message : 'Webhook processing failed',
      );
      throw error;
    }
  }

  private async dispatchWebhook(payload: RecallWebhookPayload) {
    const event = payload.event;
    const botId = payload.data?.bot?.id;
    const recordingId = payload.data?.recording?.id;
    const transcriptId = payload.data?.transcript?.id;
    const code = payload.data?.data?.code || event.split('.').pop();
    const subCode = payload.data?.data?.sub_code || undefined;
    const message = payload.data?.data?.message;

    if (event.startsWith('bot.') && botId) {
      const meeting = await this.repository.findByRecallBotId(botId);
      if (
        meeting &&
        [
          MeetingBotStatus.COMPLETED,
          MeetingBotStatus.CANCELLED,
          MeetingBotStatus.FAILED,
        ].includes(meeting.status)
      ) {
        return;
      }
      const failure =
        event === 'bot.fatal' ? recallFailure(subCode, message) : undefined;
      await this.repository.updateByRecallBotId(botId, {
        status: mapRecallBotStatus(event),
        recallStatusCode: code,
        recallSubCode: subCode,
        ...(failure || {}),
      });
      return;
    }

    if (event === 'recording.done' && recordingId) {
      const meeting = await this.repository.claimTranscription(
        recordingId,
        botId,
      );
      if (!meeting) return;
      try {
        const recording = await this.provider.retrieveRecording(recordingId);
        await this.storeRecordingMedia(String(meeting._id), recording);
        await this.provider.createAsyncTranscript(recordingId);
      } catch (error) {
        await this.repository.releaseTranscriptionClaim(String(meeting._id));
        throw error;
      }
      return;
    }

    if (event === 'recording.failed' && botId) {
      const failure = recallFailure(
        subCode,
        message,
        'Recall recording failed',
      );
      await this.repository.updateByRecallBotId(botId, {
        status: MeetingBotStatus.FAILED,
        ...(recordingId ? { recordingId } : {}),
        recallSubCode: subCode,
        ...failure,
      });
      return;
    }

    if (event === 'transcript.done' && transcriptId && recordingId) {
      await this.storeTranscript(recordingId, transcriptId);
      return;
    }

    if (event === 'transcript.failed' && recordingId) {
      const meeting = await this.repository.findByRecordingId(recordingId);
      if (meeting) {
        const failure = recallFailure(
          subCode,
          message,
          'Recall transcription failed',
        );
        await this.repository.updateById(String(meeting._id), {
          status: MeetingBotStatus.FAILED,
          recallSubCode: subCode,
          ...failure,
        });
      }
    }
  }

  private async storeRecordingMedia(
    meetingId: string,
    recording: RecallRecording,
  ) {
    const expiresAt = recording.expires_at
      ? new Date(recording.expires_at)
      : undefined;
    const stored = await this.audioStorage.save({
      recordingId: recording.id,
      downloadUrl: recording.media_shortcuts?.audio_mixed?.data?.download_url,
      expiresAt,
    });
    await this.repository.updateById(meetingId, {
      recordingId: recording.id,
      audioStorageProvider: stored.provider,
      audioStorageReference: stored.reference,
      ...(stored.expiresAt ? { mediaExpiresAt: stored.expiresAt } : {}),
      status: MeetingBotStatus.PROCESSING,
    });
  }

  private async storeTranscript(recordingId: string, transcriptId: string) {
    const meeting = await this.repository.findByRecordingId(recordingId);
    if (!meeting) {
      throw new NotFoundException(
        `No meeting bot is mapped to Recall recording ${recordingId}`,
      );
    }
    const transcript = await this.provider.retrieveTranscript(transcriptId);
    const downloadUrl = transcript.data?.download_url;
    if (!downloadUrl) {
      throw new BadGatewayException(
        'Recall transcript download URL is unavailable',
      );
    }
    const downloaded = await this.provider.downloadTranscript(downloadUrl);
    const formatted = this.formatTranscript(downloaded);
    await this.repository.upsertTranscript({
      meetingId: String(meeting._id),
      platform: meeting.platform,
      organizationId: meeting.organizationId,
      recordingId,
      transcriptId,
      transcriptText: formatted.text,
      segments: formatted.segments,
      wordCount: formatted.wordCount,
      provider: 'recallai_async',
      languageCode: 'auto',
    });
    await this.repository.updateById(String(meeting._id), {
      transcriptId,
      transcriptCompletedAt: new Date(),
      status: MeetingBotStatus.COMPLETED,
    });
  }

  private formatTranscript(value: unknown) {
    const sourceSegments = Array.isArray(value)
      ? value
      : value &&
          typeof value === 'object' &&
          'data' in value &&
          Array.isArray(value.data)
        ? value.data
        : [];
    const segments = sourceSegments.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object',
    );
    const lines: string[] = [];
    let wordCount = 0;
    for (const segment of segments) {
      const participant =
        segment.participant && typeof segment.participant === 'object'
          ? (segment.participant as Record<string, unknown>)
          : {};
      const speaker =
        (typeof participant.name === 'string' && participant.name) ||
        (typeof participant.id === 'string' && participant.id) ||
        'Unknown speaker';
      const words = Array.isArray(segment.words) ? segment.words : [];
      const text = words
        .map((word) =>
          word &&
          typeof word === 'object' &&
          'text' in word &&
          typeof word.text === 'string'
            ? word.text
            : '',
        )
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!text) continue;
      wordCount += text.split(/\s+/).length;
      lines.push(`${speaker}: ${text}`);
    }
    return { segments, text: lines.join('\n'), wordCount };
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting bot id');
    }
  }

  private assertRecallConfigured() {
    if (
      !this.config.get<string>('recall.apiKey') ||
      !this.config.get<string>('recall.webhookSecret')
    ) {
      throw new ServiceUnavailableException('Recall.ai is not configured');
    }
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private get defaultBotName() {
    return this.config.get<string>('recall.botName', 'Noltra AI Notetaker');
  }

  private get consentMessage() {
    return this.config.get<string>(
      'recall.consentMessage',
      'This meeting is being recorded and transcribed by Noltra AI.',
    );
  }

  private get retentionHours() {
    return this.config.get<number>('recall.retentionHours', 168);
  }

  private get googleMeetLoginGroupId() {
    return this.config.get<string>('recall.googleMeet.loginGroupId');
  }

  private get maxConcurrentMeetings() {
    return this.config.get<number>('recall.maxConcurrentMeetings', 100);
  }

  private get maxConcurrentMeetingsPerOrganization() {
    return this.config.get<number>(
      'recall.maxConcurrentMeetingsPerOrganization',
      10,
    );
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('recall.encryptionKey');
    if (key.length < 32) {
      throw new ServiceUnavailableException(
        'INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters',
      );
    }
    return key;
  }
}
