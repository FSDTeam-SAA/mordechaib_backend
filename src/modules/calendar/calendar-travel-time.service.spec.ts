import { CalendarTravelTimeService } from './calendar-travel-time.service';

describe('CalendarTravelTimeService', () => {
  const service = new CalendarTravelTimeService();

  it('reports an estimated travel conflict only when coordinates are grounded', () => {
    const result = service.assess(
      [
        {
          id: 'one',
          title: 'First meeting',
          startsAt: new Date('2026-11-04T03:00:00.000Z'),
          endsAt: new Date('2026-11-04T04:00:00.000Z'),
          location: { latitude: 23.7925, longitude: 90.4078 },
        },
        {
          id: 'two',
          title: 'Second meeting',
          startsAt: new Date('2026-11-04T04:05:00.000Z'),
          endsAt: new Date('2026-11-04T05:00:00.000Z'),
          location: { latitude: 23.8103, longitude: 90.4125 },
        },
      ],
      15,
      10,
    );

    expect(result.availability).toBe('AVAILABLE');
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        type: 'INSUFFICIENT_TRAVEL_TIME',
        meetingIds: ['one', 'two'],
        isEstimated: true,
      }),
    ]);
  });

  it('returns unavailable instead of inventing travel data without coordinates', () => {
    const result = service.assess(
      [
        {
          id: 'one',
          title: 'Meeting',
          startsAt: new Date('2026-11-04T03:00:00.000Z'),
          endsAt: new Date('2026-11-04T04:00:00.000Z'),
          location: { address: 'Dhaka' },
        },
      ],
      15,
      10,
    );

    expect(result).toEqual(
      expect.objectContaining({
        availability: 'UNAVAILABLE',
        reason: 'MEETING_COORDINATES_NOT_AVAILABLE',
        conflicts: [],
      }),
    );
  });
});
