import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CalendarProviderType } from '../../../common/enums/calendar-provider.enum';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';
import { AdminScheduleMeetingDto } from './admin-schedule-meeting.dto';
import { AdminSyncCalendarDto } from './admin-sync-calendar.dto';

describe('admin meeting calendar quick-action DTOs', () => {
  const organizationId = '66cc9bdfa847ea856c7b4101';
  const organizerUserId = '66cc9bdfa847ea856c7b4102';

  it('accepts a complete retry-safe meeting request', async () => {
    const input = plainToInstance(AdminScheduleMeetingDto, {
      organizationId,
      organizerUserId,
      platform: MeetingPlatform.GOOGLE_MEET,
      title: ' Customer review ',
      startsAt: '2026-11-20T09:00:00.000Z',
      timezone: 'Asia/Dhaka',
      idempotencyKey: 'admin-meeting-request-001',
    });

    await expect(validate(input)).resolves.toHaveLength(0);
    expect(input.title).toBe('Customer review');
  });

  it('requires an idempotency key for platform-admin meeting creation', async () => {
    const input = plainToInstance(AdminScheduleMeetingDto, {
      organizationId,
      organizerUserId,
      platform: MeetingPlatform.ZOOM,
      title: 'Customer review',
    });

    const errors = await validate(input);
    expect(errors.some((error) => error.property === 'idempotencyKey')).toBe(
      true,
    );
  });

  it('rejects malformed tenant and organizer identifiers', async () => {
    const input = plainToInstance(AdminSyncCalendarDto, {
      organizationId: 'wrong',
      organizerUserId: 'wrong',
      provider: CalendarProviderType.GOOGLE_CALENDAR,
    });

    const errors = await validate(input);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['organizationId', 'organizerUserId']),
    );
  });

  it('accepts a bounded provider-specific synchronization request', async () => {
    const input = plainToInstance(AdminSyncCalendarDto, {
      organizationId,
      organizerUserId,
      provider: CalendarProviderType.OUTLOOK_CALENDAR,
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-12-01T00:00:00.000Z',
    });

    await expect(validate(input)).resolves.toHaveLength(0);
  });
});
