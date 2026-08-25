import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import { ZoomMeetingStatus } from '../../common/enums/zoom-meeting-status.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { CreateZoomMeetingDto } from './dto/create-zoom-meeting.dto';
import { ListZoomMeetingsQueryDto } from './dto/list-zoom-meetings-query.dto';
import { UpdateZoomMeetingDto } from './dto/update-zoom-meeting.dto';
import {
  RecallApiError,
  RecallRecording,
  RecallWebhookPayload,
  RecallZoomProvider,
} from './providers/recall-zoom.provider';
import { ZoomMeetingsQueue } from './zoom-meetings.queue';
import { ZoomMeetingsRepository } from './zoom-meetings.repository';

type ZoomOAuthState = {
  userId: string;
  issuedAt: number;
  nonce: string;
};

@Injectable()
export class ZoomMeetingsService {
  constructor(
    private readonly repository: ZoomMeetingsRepository,
    private readonly provider: RecallZoomProvider,
    private readonly queue: ZoomMeetingsQueue,
    private readonly config: ConfigService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    input: CreateZoomMeetingDto,
  ) {
    this.assertRecallConfigured();
    const joinAt = input.joinAt ? new Date(input.joinAt) : undefined;
    if (joinAt && joinAt.getTime() <= Date.now()) {
      throw new BadRequestException('joinAt must be in the future');
    }
    if (this.signedInZoom && !(await this.repository.getConnection())) {
      throw new ServiceUnavailableException(
        'The signed-in Zoom service account is not connected',
      );
    }

    const normalizedUrl = this.normalizeMeetingUrl(input.meetingUrl);
    const meetingUrlHash = this.hash(normalizedUrl);
    const activeMeetingKey = this.hash(
      `${organizationId}|${meetingUrlHash}|${joinAt?.toISOString() || 'AD_HOC'}`,
    );
    const deduplicationKey = this.hash(
      input.idempotencyKey
        ? `${organizationId}|client|${input.idempotencyKey}`
        : `${activeMeetingKey}|request|${crypto.randomUUID()}`,
    );
    const duplicate = await this.repository.findDuplicate(
      deduplicationKey,
      activeMeetingKey,
    );
    if (duplicate) {
      return { ...this.toPublicMeeting(duplicate), duplicate: true };
    }

    const [globalActive, organizationActive] = await Promise.all([
      this.repository.countActive(),
      this.repository.countActive(organizationId),
    ]);
    if (globalActive >= this.maxConcurrentMeetings) {
      throw new HttpException(
        'The global concurrent Zoom meeting limit has been reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (organizationActive >= this.maxConcurrentMeetingsPerOrganization) {
      throw new HttpException(
        'The organization concurrent Zoom meeting limit has been reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result = await this.repository.createOrFind({
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
          status: ZoomMeetingStatus.FAILED,
          failureMessage: 'The Zoom meeting job could not be queued',
        });
        throw new ServiceUnavailableException(
          'The Zoom meeting could not be queued',
        );
      }
    }
    return {
      ...this.toPublicMeeting(result.meeting),
      duplicate: !result.created,
    };
  }

  list(organizationId: string, query: ListZoomMeetingsQueryDto) {
    return this.repository.list(
      organizationId,
      query.page,
      query.limit,
      query.status,
    );
  }

  async get(organizationId: string, id: string) {
    this.assertObjectId(id);
    const meeting = await this.repository.findByIdForOrganization(
      id,
      organizationId,
    );
    if (!meeting) throw new NotFoundException('Zoom meeting not found');
    return meeting;
  }

  async getTranscript(organizationId: string, id: string) {
    await this.get(organizationId, id);
    const transcript = await this.repository.findTranscript(id, organizationId);
    if (!transcript) {
      throw new NotFoundException('Zoom meeting transcript is not ready');
    }
    return transcript;
  }

  async getAudio(organizationId: string, id: string) {
    const meeting = await this.get(organizationId, id);
    if (!meeting.recordingId) {
      throw new NotFoundException('Zoom meeting audio is not ready');
    }
    let recording: RecallRecording;
    try {
      recording = await this.provider.retrieveRecording(meeting.recordingId);
    } catch (error) {
      if (
        error instanceof RecallApiError &&
        [404, 410].includes(error.status)
      ) {
        throw new NotFoundException(
          'Zoom meeting audio is unavailable or has expired',
        );
      }
      throw error;
    }
    const downloadUrl =
      recording.media_shortcuts?.audio_mixed?.data?.download_url;
    if (!downloadUrl) {
      throw new NotFoundException(
        'Zoom meeting audio is unavailable or has expired',
      );
    }
    await this.storeRecordingMedia(id, recording);
    return {
      downloadUrl,
      expiresAt: recording.expires_at || meeting.mediaExpiresAt,
      storageProvider: 'RECALL',
    };
  }

  async updateScheduled(
    organizationId: string,
    id: string,
    input: UpdateZoomMeetingDto,
  ) {
    if (!input.meetingUrl && !input.joinAt && !input.botName) {
      throw new BadRequestException('At least one update field is required');
    }
    this.assertObjectId(id);
    const meeting = await this.repository.findInternalById(id);
    if (!meeting || meeting.organizationId !== organizationId) {
      throw new NotFoundException('Zoom meeting not found');
    }
    if (
      ![ZoomMeetingStatus.PENDING, ZoomMeetingStatus.SCHEDULED].includes(
        meeting.status,
      )
    ) {
      throw new ConflictException(
        'Only pending or scheduled meetings can be updated',
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
    const meetingUrlHash = this.hash(this.normalizeMeetingUrl(meetingUrl));
    const activeMeetingKey = this.hash(
      `${organizationId}|${meetingUrlHash}|${joinAt?.toISOString() || 'AD_HOC'}`,
    );
    const duplicate =
      await this.repository.findByActiveMeetingKey(activeMeetingKey);
    if (duplicate && String(duplicate._id) !== id) {
      throw new ConflictException(
        'A bot already exists for this Zoom meeting occurrence',
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

  async cancel(organizationId: string, id: string) {
    const meeting = await this.get(organizationId, id);
    if (
      ![
        ZoomMeetingStatus.PENDING,
        ZoomMeetingStatus.CREATING,
        ZoomMeetingStatus.SCHEDULED,
        ZoomMeetingStatus.JOINING,
        ZoomMeetingStatus.WAITING_ROOM,
      ].includes(meeting.status)
    ) {
      throw new ConflictException(
        'This Zoom meeting can no longer be cancelled',
      );
    }
    if (meeting.recallBotId) {
      if (
        [ZoomMeetingStatus.JOINING, ZoomMeetingStatus.WAITING_ROOM].includes(
          meeting.status,
        )
      ) {
        await this.provider.removeBotFromCall(meeting.recallBotId);
      } else {
        await this.provider.deleteScheduledBot(meeting.recallBotId);
      }
    }
    return this.repository.updateById(id, {
      status: ZoomMeetingStatus.CANCELLED,
    });
  }

  async leave(organizationId: string, id: string) {
    const meeting = await this.get(organizationId, id);
    if (!meeting.recallBotId) {
      throw new ConflictException('The Recall bot has not been created');
    }
    if (
      ![
        ZoomMeetingStatus.JOINING,
        ZoomMeetingStatus.WAITING_ROOM,
        ZoomMeetingStatus.IN_CALL,
        ZoomMeetingStatus.RECORDING,
      ].includes(meeting.status)
    ) {
      throw new ConflictException('The Recall bot is not in the meeting');
    }
    await this.provider.removeBotFromCall(meeting.recallBotId);
    return { leaving: true, recallBotId: meeting.recallBotId };
  }

  createZoomAuthorizationUrl(userId: string) {
    return {
      authorizationUrl: this.provider.getZoomAuthorizationUrl(
        this.createOAuthState(userId),
      ),
    };
  }

  async completeZoomAuthorization(code: string, state: string) {
    const context = this.verifyOAuthState(state);
    const credential = await this.provider.createZoomOAuthCredential(code);
    const connection = await this.repository.upsertConnection({
      recallOAuthAppId: this.config.getOrThrow<string>(
        'recall.zoom.oauthAppId',
      ),
      recallCredentialId: credential.id,
      connectedByUserId: context.userId,
    });
    return {
      connected: true,
      status: connection?.status,
    };
  }

  async getZoomConnection() {
    const connection = await this.repository.getConnection();
    return connection
      ? {
          connected: true,
          status: connection.status,
          recallOAuthAppId: connection.recallOAuthAppId,
          connectedByUserId: connection.connectedByUserId,
        }
      : { connected: false };
  }

  async getZakToken() {
    const connection = await this.repository.getConnection();
    if (!connection) {
      throw new ServiceUnavailableException(
        'The signed-in Zoom service account is not connected',
      );
    }
    return this.provider.getZakToken(connection.recallCredentialId);
  }

  async processBotCreation(meetingId: string) {
    const meeting = await this.repository.claimBotCreation(meetingId);
    if (!meeting) return;
    const meetingUrl = decryptText(
      meeting.meetingUrlEncrypted,
      this.encryptionKey,
    );
    const meetingIdValue = String(meeting._id);
    const existingBot = await this.provider.findBotByMetadata(
      'zoom_meeting_id',
      meetingIdValue,
    );
    const bot =
      existingBot ||
      (await this.provider.createBot({
        meetingUrl,
        joinAt: meeting.joinAt,
        botName: meeting.botName,
        retentionHours: this.retentionHours,
        consentMessage: this.consentMessage,
        zakUrl: this.signedInZoom
          ? `${this.publicBaseUrl}/api/v1/webhooks/recall/zoom-zak`
          : undefined,
        metadata: {
          organization_id: meeting.organizationId,
          user_id: meeting.createdByUserId,
          zoom_meeting_id: meetingIdValue,
        },
      }));
    const scheduled =
      !!meeting.joinAt &&
      meeting.joinAt.getTime() > Date.now() + 10 * 60 * 1000;
    const attached = await this.repository.attachBotIfPending(
      meetingId,
      bot.id,
      scheduled ? ZoomMeetingStatus.SCHEDULED : ZoomMeetingStatus.JOINING,
    );
    if (!attached) {
      // The request was cancelled while Recall was creating the bot.
      if (scheduled) await this.provider.deleteScheduledBot(bot.id);
      else await this.provider.removeBotFromCall(bot.id);
    }
  }

  async markBotCreationFailed(meetingId: string, error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Recall bot creation failed';
    return this.repository.markBotCreationFailedIfPending(
      meetingId,
      message.slice(0, 1000),
    );
  }

  async processWebhook(eventId: string, payload: RecallWebhookPayload) {
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
          ZoomMeetingStatus.COMPLETED,
          ZoomMeetingStatus.CANCELLED,
          ZoomMeetingStatus.FAILED,
        ].includes(meeting.status)
      ) {
        return;
      }
      await this.repository.updateByRecallBotId(botId, {
        status: this.mapBotStatus(event),
        recallStatusCode: code,
        recallSubCode: subCode,
        ...(event === 'bot.fatal'
          ? { failureMessage: message || subCode || 'Recall bot failed' }
          : {}),
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
      await this.repository.updateByRecallBotId(botId, {
        status: ZoomMeetingStatus.FAILED,
        recordingId,
        recallSubCode: subCode,
        failureMessage: message || subCode || 'Recall recording failed',
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
        await this.repository.updateById(String(meeting._id), {
          status: ZoomMeetingStatus.FAILED,
          recallSubCode: subCode,
          failureMessage: message || subCode || 'Recall transcription failed',
        });
      }
    }
  }

  private async storeRecordingMedia(
    meetingId: string,
    recording: RecallRecording,
  ) {
    const audioUrl = recording.media_shortcuts?.audio_mixed?.data?.download_url;
    await this.repository.updateById(meetingId, {
      recordingId: recording.id,
      ...(audioUrl ? { audioDownloadUrl: audioUrl } : {}),
      ...(recording.expires_at
        ? { mediaExpiresAt: new Date(recording.expires_at) }
        : {}),
      status: ZoomMeetingStatus.PROCESSING,
    });
  }

  private async storeTranscript(recordingId: string, transcriptId: string) {
    const meeting = await this.repository.findByRecordingId(recordingId);
    if (!meeting) {
      throw new NotFoundException(
        `No Zoom meeting is mapped to Recall recording ${recordingId}`,
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
      status: ZoomMeetingStatus.COMPLETED,
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

  private mapBotStatus(event: string) {
    const statuses: Record<string, ZoomMeetingStatus> = {
      'bot.joining_call': ZoomMeetingStatus.JOINING,
      'bot.in_waiting_room': ZoomMeetingStatus.WAITING_ROOM,
      'bot.in_call_not_recording': ZoomMeetingStatus.IN_CALL,
      'bot.recording_permission_allowed': ZoomMeetingStatus.IN_CALL,
      'bot.recording_permission_denied': ZoomMeetingStatus.IN_CALL,
      'bot.in_call_recording': ZoomMeetingStatus.RECORDING,
      'bot.call_ended': ZoomMeetingStatus.PROCESSING,
      'bot.done': ZoomMeetingStatus.PROCESSING,
      'bot.fatal': ZoomMeetingStatus.FAILED,
    };
    return statuses[event] || ZoomMeetingStatus.PROCESSING;
  }

  private createOAuthState(userId: string) {
    const payload: ZoomOAuthState = {
      userId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.signState(encoded)}`;
  }

  private verifyOAuthState(value: string) {
    const [encoded, signature] = value.split('.');
    const expected = this.signState(encoded || '');
    if (
      !encoded ||
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid Zoom OAuth state');
    }
    let payload: ZoomOAuthState;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as ZoomOAuthState;
    } catch {
      throw new UnauthorizedException('Invalid Zoom OAuth state');
    }
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000) {
      throw new UnauthorizedException('Zoom OAuth state has expired');
    }
    return payload;
  }

  private signState(value: string) {
    return crypto
      .createHmac('sha256', this.oauthStateSecret)
      .update(value)
      .digest('base64url');
  }

  private normalizeMeetingUrl(value: string) {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid Zoom meeting id');
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

  private toPublicMeeting<T>(meeting: T) {
    return meeting;
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

  private get signedInZoom() {
    return this.config.get<boolean>('recall.zoom.signedIn', true);
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

  private get oauthStateSecret() {
    return this.config.getOrThrow<string>('recall.oauthStateSecret');
  }

  private get publicBaseUrl() {
    return this.config
      .getOrThrow<string>('APP_BASE_URL')
      .trim()
      .replace(/\/+$/, '');
  }
}
