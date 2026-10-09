import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { CalendarDashboardRepository } from './calendar-dashboard.repository';

const listQuery = (value: unknown[]) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

describe('CalendarDashboardRepository', () => {
  it('includes canonical platform meetings from every connected provider', async () => {
    const platformQuery = listQuery([]);
    const calendarQuery = listQuery([]);
    const platformMeetings = {
      find: jest.fn().mockReturnValue(platformQuery),
    };
    const calendarEvents = {
      find: jest.fn().mockReturnValue(calendarQuery),
    };
    const repository = new CalendarDashboardRepository(
      platformMeetings as never,
      calendarEvents as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const from = new Date('2026-10-01T00:00:00.000Z');
    const to = new Date('2026-11-01T00:00:00.000Z');

    await repository.meetings(
      'org-1',
      CalendarProviderType.GOOGLE_CALENDAR,
      from,
      to,
    );

    expect(platformMeetings.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      startsAt: { $lt: to },
      endsAt: { $gt: from },
    });
    expect(calendarEvents.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      provider: CalendarProviderType.GOOGLE_CALENDAR,
      startsAt: { $lt: to },
      endsAt: { $gt: from },
    });
  });
});
