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
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { CreateConnectedMeetingDto } from './dto/create-connected-meeting.dto';
import { UpdateConnectedMeetingDto } from './dto/update-connected-meeting.dto';
import { ListPlatformMeetingsQueryDto } from './dto/list-platform-meetings-query.dto';
import { GoogleMeetAuthService } from './google-meet-auth.service';
import { MeetingBotsService } from './meeting-bots.service';
import { PlatformMeetingsRepository } from './platform-meetings.repository';
import { GoogleMeetProvider } from './providers/google-meet.provider';
import {
  CreatedProviderMeeting,
  CreateProviderMeetingInput,
  UpdateProviderMeetingInput,
} from './providers/platform-meeting-provider.types';
import { RecallZoomAuthProvider } from './providers/recall-zoom-auth.provider';
import { ZoomAuthService } from './zoom-auth.service';
import { CalendarService } from '../calendar/calendar.service';

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
    private readonly calendar: CalendarService,
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
    const reminderMinutesBeforeStart =
      input.reminderMinutesBeforeStart ?? this.defaultReminderMinutes;
    const calendarProvider = immediate
      ? undefined
      : await this.calendar.getDefaultProvider(organizationId);
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
      reminderMinutesBeforeStart,
      calendarProvider,
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
      reminderMinutesBeforeStart,
    };

    let created: CreatedProviderMeeting;
    try {
      created = await this.createWithProvider(
        organizationId,
        input.platform,
        providerInput,
        calendarProvider,
      );
    } catch (error) {
      await this.repository.update(meetingId, organizationId, {
        status: PlatformMeetingStatus.FAILED,
        failureCode: 'PROVIDER_MEETING_CREATION_FAILED',
        failureMessage: this.errorMessage(error),
      });
      throw error;
    }

    let calendarEvent:
      | { id: string; provider: CalendarProviderType; htmlUrl?: string }
      | undefined;
    if (!immediate && calendarProvider) {
      try {
        const nativeGoogleCalendarMeeting =
          input.platform === MeetingPlatform.GOOGLE_MEET &&
          calendarProvider === CalendarProviderType.GOOGLE_CALENDAR;
        calendarEvent = nativeGoogleCalendarMeeting
          ? {
              id: created.providerMeetingId,
              provider: calendarProvider,
              htmlUrl:
                typeof created.metadata?.calendarEventUrl === 'string'
                  ? created.metadata.calendarEventUrl
                  : undefined,
            }
          : await this.calendar.createMeetingEvent(
              organizationId,
              {
                title: input.title,
                description: input.agenda,
                startsAt,
                endsAt,
                timezone,
                attendees: input.invitees || [],
                meetingUrl: created.joinUrl,
                reminderMinutesBeforeStart,
              },
              calendarProvider,
            );
      } catch (error) {
        await this.rollbackCreatedMeeting(
          organizationId,
          input.platform,
          created,
        );
        await this.repository.update(meetingId, organizationId, {
          status: PlatformMeetingStatus.FAILED,
          failureCode: 'CALENDAR_EVENT_CREATION_FAILED',
          failureMessage: this.errorMessage(error),
        });
        throw error;
      }
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
        ...(calendarEvent
          ? {
              calendarProvider: calendarEvent.provider,
              calendarEventId: calendarEvent.id,
              calendarEventUrl: calendarEvent.htmlUrl,
            }
          : {}),
        reminderMinutesBeforeStart,
        metadata: { ...input.metadata, ...created.metadata },
        failureCode: undefined,
        failureMessage: undefined,
      });
      if (!stored) throw new Error('The reserved meeting no longer exists');
    } catch {
      await this.rollbackCreatedMeeting(
        organizationId,
        input.platform,
        created,
        calendarEvent,
      );
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

  async update(
    organizationId: string,
    actor: { id: string; role: UserRole },
    id: string,
    input: UpdateConnectedMeetingDto,
  ) {
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one update field is required');
    }
    const meeting = await this.getInternal(organizationId, id);
    this.assertCanManage(meeting, actor.id, actor.role);
    if (meeting.status !== PlatformMeetingStatus.SCHEDULED) {
      throw new ConflictException('Only scheduled meetings can be updated');
    }
    if (!meeting.providerMeetingId) {
      throw new ConflictException('The provider meeting id is unavailable');
    }

    const startsAt = input.startsAt
      ? new Date(input.startsAt)
      : meeting.startsAt;
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('startsAt must be in the future');
    }
    const timezone = input.timezone ?? meeting.timezone;
    this.assertTimezone(timezone);
    const durationMinutes = input.durationMinutes ?? meeting.durationMinutes;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const reminderMinutesBeforeStart =
      input.reminderMinutesBeforeStart ??
      meeting.reminderMinutesBeforeStart ??
      this.defaultReminderMinutes;
    const next: UpdateProviderMeetingInput = {
      title: input.title ?? meeting.title,
      agenda: input.agenda ?? meeting.agenda,
      startsAt,
      durationMinutes,
      timezone,
      invitees: input.invitees ?? meeting.invitees,
      reminderMinutesBeforeStart,
    };
    const previous: UpdateProviderMeetingInput = {
      title: meeting.title,
      agenda: meeting.agenda,
      startsAt: meeting.startsAt,
      durationMinutes: meeting.durationMinutes,
      timezone: meeting.timezone,
      invitees: meeting.invitees,
      reminderMinutesBeforeStart:
        meeting.reminderMinutesBeforeStart ?? this.defaultReminderMinutes,
    };
    const joinUrl = meeting.joinUrlEncrypted
      ? decryptText(meeting.joinUrlEncrypted, this.encryptionKey)
      : undefined;
    const nativeGoogleCalendarMeeting =
      this.isNativeGoogleCalendarMeeting(meeting);
    let providerUpdated = false;
    let calendarUpdated = false;
    let botUpdated = false;

    try {
      if (
        meeting.platform === MeetingPlatform.ZOOM ||
        nativeGoogleCalendarMeeting
      ) {
        await this.updateWithProvider(
          organizationId,
          meeting.platform,
          meeting.providerMeetingId,
          next,
        );
        providerUpdated = true;
      }
      if (
        meeting.calendarProvider &&
        meeting.calendarEventId &&
        !nativeGoogleCalendarMeeting
      ) {
        await this.calendar.updateMeetingEvent(
          organizationId,
          meeting.calendarProvider,
          meeting.calendarEventId,
          {
            title: next.title,
            description: next.agenda,
            startsAt: next.startsAt,
            endsAt,
            timezone: next.timezone,
            attendees: next.invitees,
            meetingUrl: joinUrl,
            reminderMinutesBeforeStart,
          },
        );
        calendarUpdated = true;
      }
      if (meeting.meetingBotId && input.startsAt) {
        await this.meetingBots.updateScheduled(
          organizationId,
          meeting.meetingBotId,
          { joinAt: startsAt.toISOString() },
          meeting.platform,
        );
        botUpdated = true;
      }

      const updated = await this.repository.update(id, organizationId, {
        title: next.title,
        agenda: next.agenda,
        startsAt,
        endsAt,
        durationMinutes,
        timezone,
        invitees: next.invitees,
        reminderMinutesBeforeStart,
        failureCode: undefined,
        failureMessage: undefined,
      });
      if (!updated) {
        throw new ServiceUnavailableException(
          'The updated meeting could not be saved',
        );
      }
      return this.toResponse(updated, true);
    } catch (error) {
      if (botUpdated && meeting.meetingBotId) {
        await this.meetingBots
          .updateScheduled(
            organizationId,
            meeting.meetingBotId,
            { joinAt: meeting.startsAt.toISOString() },
            meeting.platform,
          )
          .catch(() => undefined);
      }
      if (
        calendarUpdated &&
        meeting.calendarProvider &&
        meeting.calendarEventId
      ) {
        await this.calendar
          .updateMeetingEvent(
            organizationId,
            meeting.calendarProvider,
            meeting.calendarEventId,
            {
              title: previous.title,
              description: previous.agenda,
              startsAt: previous.startsAt,
              endsAt: meeting.endsAt,
              timezone: previous.timezone,
              attendees: previous.invitees,
              meetingUrl: joinUrl,
              reminderMinutesBeforeStart: previous.reminderMinutesBeforeStart,
            },
          )
          .catch(() => undefined);
      }
      if (providerUpdated) {
        await this.updateWithProvider(
          organizationId,
          meeting.platform,
          meeting.providerMeetingId,
          previous,
        ).catch(() => undefined);
      }
      await this.repository
        .update(id, organizationId, {
          failureCode: 'MEETING_UPDATE_FAILED',
          failureMessage: this.errorMessage(error),
        })
        .catch(() => undefined);
      throw error;
    }
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
    if (meeting.meetingBotId) {
      await this.meetingBots.cancel(
        organizationId,
        meeting.meetingBotId,
        meeting.platform,
      );
    }

    const cancellationTasks: Array<Promise<unknown>> = [];
    if (meeting.calendarProvider && meeting.calendarEventId) {
      cancellationTasks.push(
        this.calendar.cancelMeetingEvent(
          organizationId,
          meeting.calendarProvider,
          meeting.calendarEventId,
        ),
      );
    }
    if (
      meeting.platform === MeetingPlatform.ZOOM ||
      (!meeting.calendarEventId && this.isNativeGoogleCalendarMeeting(meeting))
    ) {
      cancellationTasks.push(
        this.deleteWithProvider(
          organizationId,
          meeting.platform,
          meeting.providerMeetingId,
        ),
      );
    }
    const cancellations = await Promise.allSettled(cancellationTasks);
    const failedCancellation = cancellations.find(
      (result) => result.status === 'rejected',
    );
    if (failedCancellation?.status === 'rejected') {
      await this.repository.update(id, organizationId, {
        failureCode: 'MEETING_CANCELLATION_FAILED',
        failureMessage: this.errorMessage(failedCancellation.reason),
      });
      throw new ServiceUnavailableException(
        'The meeting could not be fully cancelled; retry the request',
      );
    }
    const cancelled = await this.repository.update(id, organizationId, {
      status: PlatformMeetingStatus.CANCELLED,
      failureCode: undefined,
      failureMessage: undefined,
    });
    return this.toResponse(cancelled || meeting, true);
  }

  private async createWithProvider(
    organizationId: string,
    platform: MeetingPlatform,
    input: CreateProviderMeetingInput,
    calendarProvider?: CalendarProviderType,
  ) {
    if (platform === MeetingPlatform.ZOOM) {
      const accessToken = await this.zoomAuth.getAccessToken(organizationId);
      return this.zoomProvider.createMeeting(accessToken, input);
    }
    const accessToken = await this.googleAuth.getAccessToken(organizationId);
    if (
      input.immediate ||
      calendarProvider === CalendarProviderType.OUTLOOK_CALENDAR
    ) {
      return this.googleProvider.createStandaloneMeeting(accessToken);
    }
    return this.googleProvider.createMeeting(accessToken, input);
  }

  private async updateWithProvider(
    organizationId: string,
    platform: MeetingPlatform,
    providerMeetingId: string,
    input: UpdateProviderMeetingInput,
  ) {
    if (platform === MeetingPlatform.ZOOM) {
      const accessToken = await this.zoomAuth.getAccessToken(organizationId);
      return this.zoomProvider.updateMeeting(
        accessToken,
        providerMeetingId,
        input,
      );
    }
    const accessToken = await this.googleAuth.getAccessToken(organizationId);
    return this.googleProvider.updateMeeting(
      accessToken,
      providerMeetingId,
      input,
    );
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

  private async rollbackCreatedMeeting(
    organizationId: string,
    platform: MeetingPlatform,
    created: CreatedProviderMeeting,
    calendarEvent?: {
      id: string;
      provider: CalendarProviderType;
      htmlUrl?: string;
    },
  ) {
    const googleMode = created.metadata?.googleMeetingMode;
    if (
      calendarEvent &&
      !(
        platform === MeetingPlatform.GOOGLE_MEET &&
        googleMode === 'CALENDAR_EVENT'
      )
    ) {
      await this.calendar
        .cancelMeetingEvent(
          organizationId,
          calendarEvent.provider,
          calendarEvent.id,
        )
        .catch(() => undefined);
    }
    if (platform === MeetingPlatform.ZOOM || googleMode === 'CALENDAR_EVENT') {
      await this.deleteWithProvider(
        organizationId,
        platform,
        created.providerMeetingId,
      ).catch(() => undefined);
    }
  }

  private isNativeGoogleCalendarMeeting(meeting: StoredPlatformMeeting) {
    return (
      meeting.platform === MeetingPlatform.GOOGLE_MEET &&
      (meeting.metadata?.googleMeetingMode === 'CALENDAR_EVENT' ||
        meeting.calendarProvider === CalendarProviderType.GOOGLE_CALENDAR)
    );
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

  private get defaultReminderMinutes() {
    return this.config.get<number>(
      'meetingPlatforms.defaultReminderMinutes',
      15,
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
