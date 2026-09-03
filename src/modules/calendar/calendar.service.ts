import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import {
  CalendarEventInput,
  CalendarProvider,
  UpdateCalendarEventInput,
} from '../../common/types/calendar-provider.interface';
import { CalendarRepository } from './calendar.repository';
import { CalendarEventsRepository } from './calendar-events.repository';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { ListCalendarEventsQueryDto } from './dto/list-calendar-events-query.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { OutlookCalendarProvider } from './providers/outlook-calendar.provider';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';

type StoredCalendarEvent = ManagedCalendarEvent & {
  _id: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly repository: CalendarRepository,
    private readonly google: GoogleCalendarProvider,
    private readonly outlook: OutlookCalendarProvider,
    private readonly config: ConfigService,
    private readonly events: CalendarEventsRepository,
  ) {}

  async listConnections(organizationId: string) {
    const items = await this.repository.list(organizationId);
    const defaultConnection = items.find(
      (item) => item.status === 'CONNECTED' && item.isDefaultCalendar,
    );
    const fallback =
      defaultConnection || items.find((item) => item.status === 'CONNECTED');
    return {
      defaultProvider: fallback?.provider,
      connections: Object.values(CalendarProviderType).map((provider) => {
        const connection = items.find(
          (item) => String(item.provider) === provider,
        );
        const metadata = connection?.metadata || {};
        return {
          provider,
          connected: connection?.status === 'CONNECTED',
          status: connection?.status || 'DISCONNECTED',
          isDefault: String(fallback?.provider) === provider,
          account: {
            id: metadata.providerAccountId,
            email: metadata.providerEmail,
            name: metadata.providerName,
          },
          connectedByUserId: metadata.connectedByUserId,
          expiresAt: connection?.expiresAt,
        };
      }),
    };
  }

  async setDefault(organizationId: string, provider: CalendarProviderType) {
    await this.repository.setDefault(organizationId, provider);
    return this.listConnections(organizationId);
  }

  async getDefaultProvider(organizationId: string) {
    const integration =
      await this.repository.findDefaultConnected(organizationId);
    if (!integration) {
      throw new ServiceUnavailableException(
        'Connect a Google or Outlook calendar before scheduling a meeting',
      );
    }
    return integration.provider as unknown as CalendarProviderType;
  }

  async createEvent(
    organizationId: string,
    userId: string,
    input: CreateCalendarEventDto,
  ) {
    const { startsAt, endsAt } = this.timeRange(input.startTime, input.endTime);
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('startTime must be in the future');
    }
    const timezone = input.timezone || this.defaultTimezone;
    this.assertTimezone(timezone);
    const provider = await this.getDefaultProvider(organizationId);
    const reminderMinutesBeforeStart =
      input.reminderMinutesBeforeStart ?? this.defaultReminderMinutes;
    const idempotencyHash = this.hash(
      `${organizationId}|CALENDAR_EVENT|${input.idempotencyKey || crypto.randomUUID()}`,
    );
    const reservation = await this.events.reserve({
      organizationId,
      createdByUserId: userId,
      idempotencyHash,
      provider,
      title: input.title,
      description: input.description,
      startsAt,
      endsAt,
      timezone,
      attendees: input.attendees || [],
      reminderMinutesBeforeStart,
    });
    if (!reservation.event) {
      throw new ServiceUnavailableException(
        'The calendar event could not be reserved',
      );
    }
    if (!reservation.created) {
      return { ...this.toEventResponse(reservation.event), duplicate: true };
    }

    const eventId = String(reservation.event._id);
    let externalEvent;
    try {
      externalEvent = await this.createMeetingEvent(
        organizationId,
        {
          title: input.title,
          description: input.description,
          startsAt,
          endsAt,
          timezone,
          attendees: input.attendees || [],
          reminderMinutesBeforeStart,
        },
        provider,
      );
    } catch (error) {
      await this.events
        .update(eventId, organizationId, {
          status: CalendarEventStatus.FAILED,
          failureCode: 'PROVIDER_EVENT_CREATION_FAILED',
          failureMessage: this.errorMessage(error),
        })
        .catch(() => undefined);
      throw error;
    }

    try {
      const stored = await this.events.update(eventId, organizationId, {
        providerEventId: externalEvent.id,
        providerEventUrl: externalEvent.htmlUrl,
        status: CalendarEventStatus.SCHEDULED,
        failureCode: undefined,
        failureMessage: undefined,
      });
      if (!stored) throw new Error('The reserved event no longer exists');
      return { ...this.toEventResponse(stored), duplicate: false };
    } catch {
      await this.cancelMeetingEvent(
        organizationId,
        provider,
        externalEvent.id,
      ).catch(() => undefined);
      await this.events
        .update(eventId, organizationId, {
          status: CalendarEventStatus.FAILED,
          failureCode: 'EVENT_PERSISTENCE_FAILED',
          failureMessage:
            'The provider event was rolled back because it could not be saved',
        })
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'The calendar event could not be saved',
      );
    }
  }

  async listEvents(organizationId: string, query: ListCalendarEventsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }
    const result = await this.events.list(
      organizationId,
      query.page,
      query.limit,
      {
        provider: query.provider,
        status: query.status,
        from,
        to,
      },
    );
    return {
      ...result,
      items: result.items.map((event) => this.toEventResponse(event)),
    };
  }

  async getEvent(organizationId: string, id: string) {
    this.assertObjectId(id);
    const event = await this.events.findById(id, organizationId);
    if (!event) throw new NotFoundException('Calendar event not found');
    return this.toEventResponse(event);
  }

  async updateEvent(
    organizationId: string,
    id: string,
    input: UpdateCalendarEventDto,
  ) {
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one update field is required');
    }
    this.assertObjectId(id);
    const event = await this.events.findById(id, organizationId);
    if (!event) throw new NotFoundException('Calendar event not found');
    if (event.status !== CalendarEventStatus.SCHEDULED) {
      throw new ConflictException(
        'Only scheduled calendar events can be updated',
      );
    }
    if (!event.providerEventId) {
      throw new ConflictException('The provider event id is unavailable');
    }

    const { startsAt, endsAt } = this.timeRange(
      input.startTime || event.startsAt.toISOString(),
      input.endTime || event.endsAt.toISOString(),
    );
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('startTime must be in the future');
    }
    const timezone = input.timezone || event.timezone;
    this.assertTimezone(timezone);
    const next = {
      title: input.title ?? event.title,
      description: input.description ?? event.description,
      startsAt,
      endsAt,
      timezone,
      attendees: input.attendees ?? event.attendees,
      reminderMinutesBeforeStart:
        input.reminderMinutesBeforeStart ?? event.reminderMinutesBeforeStart,
    };
    const previous = {
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      attendees: event.attendees,
      reminderMinutesBeforeStart: event.reminderMinutesBeforeStart,
    };

    const external = await this.updateMeetingEvent(
      organizationId,
      event.provider,
      event.providerEventId,
      next,
    );
    try {
      const updated = await this.events.update(id, organizationId, {
        ...next,
        providerEventUrl: external.htmlUrl ?? event.providerEventUrl,
        failureCode: undefined,
        failureMessage: undefined,
      });
      if (!updated) throw new Error('The calendar event no longer exists');
      return this.toEventResponse(updated);
    } catch {
      await this.updateMeetingEvent(
        organizationId,
        event.provider,
        event.providerEventId,
        previous,
      ).catch(() => undefined);
      await this.events
        .update(id, organizationId, {
          failureCode: 'EVENT_UPDATE_FAILED',
          failureMessage:
            'The provider event was restored because the update could not be saved',
        })
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'The calendar event update could not be saved',
      );
    }
  }

  async cancelEvent(organizationId: string, id: string) {
    this.assertObjectId(id);
    const event = await this.events.findById(id, organizationId);
    if (!event) throw new NotFoundException('Calendar event not found');
    if (event.status === CalendarEventStatus.CANCELLED) {
      return this.toEventResponse(event);
    }
    if (event.status !== CalendarEventStatus.SCHEDULED) {
      throw new ConflictException('This calendar event cannot be cancelled');
    }
    if (!event.providerEventId) {
      throw new ConflictException('The provider event id is unavailable');
    }
    await this.cancelMeetingEvent(
      organizationId,
      event.provider,
      event.providerEventId,
    );
    const cancelled = await this.events.update(id, organizationId, {
      status: CalendarEventStatus.CANCELLED,
      failureCode: undefined,
      failureMessage: undefined,
    });
    if (!cancelled) {
      throw new ServiceUnavailableException(
        'The cancelled calendar event state could not be saved',
      );
    }
    return this.toEventResponse(cancelled);
  }

  async createMeetingEvent(
    organizationId: string,
    input: CalendarEventInput,
    requiredProvider?: CalendarProviderType,
  ) {
    const integration = requiredProvider
      ? await this.repository.findConnected(organizationId, requiredProvider)
      : await this.repository.findDefaultConnected(organizationId);
    if (!integration) {
      throw new ServiceUnavailableException(
        'The required organization calendar is not connected',
      );
    }
    const provider = integration.provider as unknown as CalendarProviderType;
    const accessToken = await this.getAccessToken(organizationId, provider);
    return this.providerFor(provider).createEvent(accessToken, input);
  }

  async updateMeetingEvent(
    organizationId: string,
    provider: CalendarProviderType,
    eventId: string,
    input: UpdateCalendarEventInput,
  ) {
    const accessToken = await this.getAccessToken(organizationId, provider);
    return this.providerFor(provider).updateEvent(accessToken, eventId, input);
  }

  async cancelMeetingEvent(
    organizationId: string,
    provider: CalendarProviderType,
    eventId: string,
  ) {
    const accessToken = await this.getAccessToken(organizationId, provider);
    await this.providerFor(provider).cancelEvent(accessToken, eventId);
  }

  async getAccessToken(organizationId: string, provider: CalendarProviderType) {
    const integration = await this.repository.findConnected(
      organizationId,
      provider,
    );
    if (!integration) {
      throw new ServiceUnavailableException(
        `The organization ${provider} account is not connected`,
      );
    }
    if (
      integration.accessToken &&
      (!integration.expiresAt ||
        new Date(integration.expiresAt).getTime() > Date.now() + 60_000)
    ) {
      return decryptText(integration.accessToken, this.encryptionKey);
    }
    if (!integration.refreshToken) {
      throw new ServiceUnavailableException(
        `The ${provider} connection must be reauthorized`,
      );
    }
    const tokens = await this.providerFor(provider).refreshAccessToken(
      decryptText(integration.refreshToken, this.encryptionKey),
    );
    if (!tokens.access_token) {
      throw new ServiceUnavailableException(
        `${provider} did not return an access token`,
      );
    }
    await this.repository.upsert(organizationId, provider, {
      status: 'CONNECTED',
      accessToken: encryptText(tokens.access_token, this.encryptionKey),
      ...(tokens.refresh_token
        ? {
            refreshToken: encryptText(tokens.refresh_token, this.encryptionKey),
          }
        : {}),
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
    });
    return tokens.access_token;
  }

  private providerFor(provider: CalendarProviderType): CalendarProvider {
    return provider === CalendarProviderType.OUTLOOK_CALENDAR
      ? this.outlook
      : this.google;
  }

  private timeRange(startTime: string, endTime: string) {
    const startsAt = new Date(startTime);
    const endsAt = new Date(endTime);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      startsAt >= endsAt
    ) {
      throw new BadRequestException('Calendar event time range is invalid');
    }
    return { startsAt, endsAt };
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid calendar event id');
    }
  }

  private toEventResponse(event: StoredCalendarEvent) {
    const safe = { ...event } as Record<string, unknown>;
    delete safe._id;
    delete safe.__v;
    delete safe.idempotencyHash;
    return { ...safe, id: String(event._id) };
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
