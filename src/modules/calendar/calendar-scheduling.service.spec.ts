import { CalendarSchedulingService } from './calendar-scheduling.service';

describe('CalendarSchedulingService', () => {
  const service = new CalendarSchedulingService();

  it('suggests the first buffered slot inside organization business hours', () => {
    const result = service.suggest({
      from: new Date('2026-11-04T00:00:00.000Z'),
      to: new Date('2026-11-05T00:00:00.000Z'),
      now: new Date('2026-11-04T00:00:00.000Z'),
      timezone: 'UTC',
      businessHours: { start: '09:00', end: '17:00' },
      busy: [
        {
          startsAt: new Date('2026-11-04T09:00:00.000Z'),
          endsAt: new Date('2026-11-04T10:00:00.000Z'),
        },
      ],
      durationMinutes: 30,
      bufferMinutes: 15,
      limit: 1,
    });

    expect(result).toMatchObject({
      availability: 'AVAILABLE',
      engine: 'DETERMINISTIC',
      suggestions: [
        {
          startsAt: '2026-11-04T10:15:00.000Z',
          endsAt: '2026-11-04T10:45:00.000Z',
        },
      ],
    });
  });

  it('does not invent slots without configured business hours', () => {
    expect(
      service.suggest({
        from: new Date('2026-11-04T00:00:00.000Z'),
        to: new Date('2026-11-05T00:00:00.000Z'),
        now: new Date('2026-11-04T00:00:00.000Z'),
        timezone: 'UTC',
        busy: [],
        durationMinutes: 30,
        bufferMinutes: 15,
        limit: 5,
      }),
    ).toMatchObject({
      availability: 'UNAVAILABLE',
      reason: 'BUSINESS_HOURS_NOT_CONFIGURED',
    });
  });
});
