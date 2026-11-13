import { BadRequestException } from '@nestjs/common';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { MeetingType } from '../../common/enums/meeting-type.enum';
import { AdminMeetingCalendarRepository } from './admin-meeting-calendar.repository';
import { AdminMeetingCalendarService } from './admin-meeting-calendar.service';
import { AdminMeetingCalendarQueryDto } from './dto/admin-meeting-calendar-query.dto';

describe('AdminMeetingCalendarService', () => {
  const repository = { dashboard: jest.fn() };
  let service: AdminMeetingCalendarService;

  const query = {
    from: new Date('2026-11-01T00:00:00.000Z'),
    to: new Date('2026-12-01T00:00:00.000Z'),
    timezone: 'Asia/Dhaka',
    page: 1,
    limit: 20,
  } as AdminMeetingCalendarQueryDto;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AdminMeetingCalendarService(
      repository as unknown as AdminMeetingCalendarRepository,
    );
  });

  it('returns a normalized admin dashboard response', async () => {
    const row = {
      id: 'meeting-1',
      sourceType: AdminMeetingSourceType.PLATFORM_MEETING,
      organization: { id: 'org-1', name: 'Acme' },
      title: 'Deal review',
      description: 'Review proposal',
      startsAt: new Date('2026-11-20T09:00:00.000Z'),
      endsAt: new Date('2026-11-20T09:30:00.000Z'),
      durationMinutes: 30,
      timezone: 'Asia/Dhaka',
      participantEmails: ['customer@example.com'],
      status: AdminMeetingStatus.CONFIRMED,
      meetingType: MeetingType.GOOGLE_MEET,
      calendarProvider: CalendarProviderType.GOOGLE_CALENDAR,
      meetingPlatform: 'GOOGLE_MEET',
      eventUrl: 'https://calendar.example/event-1',
    };
    repository.dashboard.mockResolvedValue({
      summary: {
        total: 4,
        pending: 1,
        confirmed: 2,
        completed: 1,
        cancelled: 0,
        failed: 1,
      },
      meetingTypes: [
        { meetingType: MeetingType.GOOGLE_MEET, count: 3 },
        { meetingType: MeetingType.ZOOM_MEET, count: 1 },
      ],
      items: [row],
      upcoming: [row],
      total: 1,
    });

    const result = await service.dashboard(
      query,
      new Date('2026-11-13T06:00:00.000Z'),
    );

    expect(result.meetingTypes).toEqual([
      { meetingType: MeetingType.GOOGLE_MEET, count: 3, percentage: 75 },
      { meetingType: MeetingType.ZOOM_MEET, count: 1, percentage: 25 },
    ]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        startsAt: '2026-11-20T09:00:00.000Z',
        canComplete: false,
        canCancel: false,
        canDelete: false,
      }),
    );
    expect(result.upcoming).toHaveLength(1);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    });
  });

  it('returns stable empty dashboard sections', async () => {
    repository.dashboard.mockResolvedValue({
      summary: undefined,
      meetingTypes: [],
      items: [],
      upcoming: [],
      total: 0,
    });

    const result = await service.dashboard(query);
    expect(result.summary).toEqual({
      total: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
    });
    expect(result.pagination.pages).toBe(0);
  });

  it('rejects an inverted date range before querying', async () => {
    await expect(
      service.dashboard({
        ...query,
        from: new Date('2026-12-01T00:00:00.000Z'),
        to: new Date('2026-11-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.dashboard).not.toHaveBeenCalled();
  });

  it('rejects ranges longer than 366 days', async () => {
    await expect(
      service.dashboard({
        ...query,
        from: new Date('2025-01-01T00:00:00.000Z'),
        to: new Date('2026-11-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
