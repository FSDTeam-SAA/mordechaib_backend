import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { CreateConnectedMeetingDto } from './dto/create-connected-meeting.dto';
import { ListPlatformMeetingsQueryDto } from './dto/list-platform-meetings-query.dto';
import { GoogleMeetAuthService } from './google-meet-auth.service';
import { MeetingBotsService } from './meeting-bots.service';
import { PlatformMeetingsRepository } from './platform-meetings.repository';
import { GoogleMeetProvider } from './providers/google-meet.provider';
import {
  CreatedProviderMeeting,
  CreateProviderMeetingInput,
} from './providers/platform-meeting-provider.types';
import { RecallZoomAuthProvider } from './providers/recall-zoom-auth.provider';
import { ZoomAuthService } from './zoom-auth.service';

type StoredPlatformMeeting = PlatformMeeting & {
  _id: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class PlatformMeetingsService {
  constructor(
    private readonly repository: PlatformMeetingsRepository,
    private readonly meetingBots: MeetingBotsService,
    private readonly zoomAuth: ZoomAuthService,
    private readonly googleAuth: GoogleMeetAuthService,
    private readonly zoomProvider: RecallZoomAuthProvider,
    private readonly googleProvider: GoogleMeetProvider,
    private readonly config: ConfigService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    input: CreateConnectedMeetingDto,
  ) {
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const immediate = !input.startsAt;
    if (!immediate && startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('startsAt must be in the future');
    }
    const timezone = input.timezone || this.defaultTimezone;
    this.assertTimezone(timezone);
    const durationMinutes =
      input.durationMinutes || this.defaultDurationMinutes;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const idempotencyHash = this.hash(
      `${organizationId}|${input.platform}|${input.idempotencyKey || crypto.randomUUID()}`,
    );
    const reservation = await this.repository.reserve({
      platform: input.platform,
      organizationId,
      createdByUserId: userId,
      idempotencyHash,
      title: input.title,
      agenda: input.agenda,
      startsAt,
      endsAt,
      durationMinutes,
      timezone,
      invitees: input.invitees || [],
      botRequested: input.sendBot !== false,
      metadata: input.metadata,
    });
    if (!reservation.meeting) {
      throw new ServiceUnavailableException(
        'The meeting could not be reserved',
      );
    }
    if (!reservation.created) {
      return {
        ...this.toResponse(
          reservation.meeting,
          this.canManage(reservation.meeting, userId),
        ),
        duplicate: true,
      };
    }

    const meetingId = String(reservation.meeting._id);
    const providerInput: CreateProviderMeetingInput = {
      title: input.title,
      agenda: input.agenda,
      startsAt,
      durationMinutes,
      timezone,
      invitees: input.invitees || [],
      immediate,
    };

    let created: CreatedProviderMeeting;
    try {
      created = await this.createWithProvider(
        organizationId,
        input.platform,
        providerInput,
      );
    } catch (error) {
      await this.repository.update(meetingId, organizationId, {
        status: PlatformMeetingStatus.FAILED,
        failureCode: 'PROVIDER_MEETING_CREATION_FAILED',
        failureMessage: this.errorMessage(error),
      });
      throw error;
    }

    const status = immediate
      ? PlatformMeetingStatus.READY
      : PlatformMeetingStatus.SCHEDULED;
    let stored;
    try {
      stored = await this.repository.update(meetingId, organizationId, {
        providerMeetingId: created.providerMeetingId,
        joinUrlEncrypted: encryptText(created.joinUrl, this.encryptionKey),
        ...(created.startUrl
          ? {
              startUrlEncrypted: encryptText(
                created.startUrl,
                this.encryptionKey,
              ),
            }
          : {}),
        status,
        metadata: { ...input.metadata, ...created.metadata },
        failureCode: undefined,
        failureMessage: undefined,
      });
      if (!stored) throw new Error('The reserved meeting no longer exists');
    } catch {
      await this.deleteWithProvider(
        organizationId,
        input.platform,
        created.providerMeetingId,
      ).catch(() => undefined);
      await this.repository
        .update(meetingId, organizationId, {
          status: PlatformMeetingStatus.FAILED,
          failureCode: 'MEETING_PERSISTENCE_FAILED',
          failureMessage:
            'The provider meeting could not be safely persisted and was rolled back',
        })
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'The provider meeting could not be saved',
      );
    }

    let warning: string | undefined;
    if (input.sendBot !== false) {
      try {
        stored = await this.attachBot(
          organizationId,
          userId,
          stored,
          input.botName,
        );
      } catch (error) {
        warning =
          'The meeting was created, but the Recall bot could not be queued. Retry the bot endpoint.';
        stored =
          (await this.repository.update(meetingId, organizationId, {
            failureCode: 'BOT_PROVISIONING_FAILED',
            failureMessage: this.errorMessage(error),
          })) || stored;
      }
    }

    return {
      ...this.toResponse(stored, true),
      duplicate: false,
      ...(warning ? { warning } : {}),
    };
  }

  async list(
    organizationId: string,
    actor: { id: string; role: UserRole },
    query: ListPlatformMeetingsQueryDto,
  ) {
    const result = await this.repository.list(
      organizationId,
      query.page,
      query.limit,
      query.platform,
      query.status,
    );
    return {
      ...result,
      items: result.items.map((item) =>
        this.toResponse(item, this.canManage(item, actor.id, actor.role)),
      ),
    };
  }

  async get(
    organizationId: string,
    actor: { id: string; role: UserRole },
    id: string,
  ) {
    let meeting = await this.getInternal(organizationId, id);
    const canManage = this.canManage(meeting, actor.id, actor.role);
    if (
      canManage &&
      meeting.platform === MeetingPlatform.ZOOM &&
      meeting.providerMeetingId &&
      [PlatformMeetingStatus.READY, PlatformMeetingStatus.SCHEDULED].includes(
        meeting.status,
      )
    ) {
      const accessToken = await this.zoomAuth.getAccessToken(organizationId);
      const providerMeeting = await this.zoomProvider.getMeeting(
        accessToken,
        meeting.providerMeetingId,
      );
      if (providerMeeting.start_url) {
        meeting =
          (await this.repository.update(id, organizationId, {
            startUrlEncrypted: encryptText(
              providerMeeting.start_url,
              this.encryptionKey,
            ),
            ...(providerMeeting.join_url
              ? {
                  joinUrlEncrypted: encryptText(
                    providerMeeting.join_url,
                    this.encryptionKey,
                  ),
                }
              : {}),
          })) || meeting;
      }
    }
    return this.toResponse(meeting, canManage);
  }

  async provisionBot(
    organizationId: string,
    actor: { id: string; role: UserRole },
    id: string,
    botName?: string,
  ) {
    let meeting = await this.getInternal(organizationId, id);
    this.assertCanManage(meeting, actor.id, actor.role);
    if (
      ![PlatformMeetingStatus.READY, PlatformMeetingStatus.SCHEDULED].includes(
        meeting.status,
      )
    ) {
      throw new ConflictException('A bot cannot be added to this meeting');
    }
    if (meeting.meetingBotId) {
      return { ...this.toResponse(meeting, true), duplicate: true };
    }
    meeting = await this.attachBot(organizationId, actor.id, meeting, botName);
    return { ...this.toResponse(meeting, true), duplicate: false };
  }

  async cancel(
    organizationId: string,
    actor: { id: string; role: UserRole },
    id: string,
  ) {
    const meeting = await this.getInternal(organizationId, id);
    this.assertCanManage(meeting, actor.id, actor.role);
    if (
      ![PlatformMeetingStatus.READY, PlatformMeetingStatus.SCHEDULED].includes(
        meeting.status,
      )
    ) {
      throw new ConflictException('This meeting cannot be cancelled');
    }
    if (!meeting.providerMeetingId) {
      throw new ConflictException('The provider meeting id is unavailable');
    }
    await this.deleteWithProvider(
      organizationId,
      meeting.platform,
      meeting.providerMeetingId,
    );
    if (meeting.meetingBotId) {
      await this.meetingBots
        .cancel(organizationId, meeting.meetingBotId, meeting.platform)
        .catch(() => undefined);
    }
    const cancelled = await this.repository.update(id, organizationId, {
      status: PlatformMeetingStatus.CANCELLED,
    });
    return this.toResponse(cancelled || meeting, true);
  }

  private async createWithProvider(
    organizationId: string,
    platform: MeetingPlatform,
    input: CreateProviderMeetingInput,
  ) {
    if (platform === MeetingPlatform.ZOOM) {
      const accessToken = await this.zoomAuth.getAccessToken(organizationId);
      return this.zoomProvider.createMeeting(accessToken, input);
    }
    const accessToken = await this.googleAuth.getAccessToken(organizationId);
    return this.googleProvider.createMeeting(accessToken, input);
  }

  private async deleteWithProvider(
    organizationId: string,
    platform: MeetingPlatform,
    providerMeetingId: string,
  ) {
    if (platform === MeetingPlatform.ZOOM) {
      const accessToken = await this.zoomAuth.getAccessToken(organizationId);
      return this.zoomProvider.deleteMeeting(accessToken, providerMeetingId);
    }
    const accessToken = await this.googleAuth.getAccessToken(organizationId);
    return this.googleProvider.deleteMeeting(accessToken, providerMeetingId);
  }

  private async attachBot(
    organizationId: string,
    userId: string,
    meeting: StoredPlatformMeeting,
    botName?: string,
  ) {
    if (!meeting.joinUrlEncrypted) {
      throw new ConflictException('The meeting join URL is unavailable');
    }
    const meetingId = String(meeting._id);
    const joinAt =
      meeting.startsAt.getTime() > Date.now()
        ? meeting.startsAt.toISOString()
        : undefined;
    const bot = await this.meetingBots.create(
      organizationId,
      userId,
      meeting.platform,
      {
        meetingUrl: decryptText(meeting.joinUrlEncrypted, this.encryptionKey),
        joinAt,
        botName,
        idempotencyKey: `platform-meeting:${meetingId}:${crypto.randomUUID()}`,
        metadata: {
          platformMeetingId: meetingId,
          providerMeetingId: meeting.providerMeetingId,
        },
      },
    );
    const updated = await this.repository.update(meetingId, organizationId, {
      meetingBotId: String(bot._id),
      botRequested: true,
      failureCode: undefined,
      failureMessage: undefined,
    });
    if (!updated) {
      throw new ServiceUnavailableException(
        'The meeting bot link was not saved',
      );
    }
    return updated;
  }

  private async getInternal(organizationId: string, id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const meeting = await this.repository.findInternalById(id, organizationId);
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  private toResponse(meeting: StoredPlatformMeeting, includeStartUrl: boolean) {
    const meetingId = String(meeting._id);
    const joinUrlEncrypted = meeting.joinUrlEncrypted;
    const startUrlEncrypted = meeting.startUrlEncrypted;
    const safe = { ...meeting } as Record<string, unknown>;
    delete safe._id;
    delete safe.__v;
    delete safe.idempotencyHash;
    delete safe.joinUrlEncrypted;
    delete safe.startUrlEncrypted;
    return {
      ...safe,
      id: meetingId,
      joinUrl: joinUrlEncrypted
        ? decryptText(joinUrlEncrypted, this.encryptionKey)
        : undefined,
      startUrl:
        includeStartUrl && startUrlEncrypted
          ? decryptText(startUrlEncrypted, this.encryptionKey)
          : undefined,
    };
  }

  private canManage(
    meeting: StoredPlatformMeeting,
    userId: string,
    role?: UserRole,
  ) {
    return (
      meeting.createdByUserId === userId ||
      role === UserRole.OWNER ||
      role === UserRole.ADMIN
    );
  }

  private assertCanManage(
    meeting: StoredPlatformMeeting,
    userId: string,
    role: UserRole,
  ) {
    if (!this.canManage(meeting, userId, role)) {
      throw new ForbiddenException(
        'Only the meeting creator, owner, or administrator can manage this meeting',
      );
    }
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : 'Unknown error').slice(
      0,
      1000,
    );
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private get defaultTimezone() {
    return this.config.get<string>(
      'meetingPlatforms.defaultTimezone',
      'Asia/Dhaka',
    );
  }

  private get defaultDurationMinutes() {
    return this.config.get<number>(
      'meetingPlatforms.defaultDurationMinutes',
      30,
    );
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('integrations.encryptionKey');
    if (key.length < 32) {
      throw new ServiceUnavailableException(
        'INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters',
      );
    }
    return key;
  }
}
