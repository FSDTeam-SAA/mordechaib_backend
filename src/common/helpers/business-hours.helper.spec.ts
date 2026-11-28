import { isWithinBusinessHours } from './business-hours.helper';

describe('isWithinBusinessHours', () => {
  it('returns true when businessHours is undefined or null', () => {
    expect(isWithinBusinessHours(new Date(), undefined)).toBe(true);
    expect(isWithinBusinessHours(new Date(), null)).toBe(true);
  });

  it('returns true when start or end is missing', () => {
    expect(isWithinBusinessHours(new Date(), { start: '09:00' })).toBe(true);
    expect(isWithinBusinessHours(new Date(), { end: '17:00' })).toBe(true);
  });

  it('correctly evaluates daytime business hours in UTC', () => {
    const hours = { start: '09:00', end: '17:00' };

    // 08:59 UTC -> outside
    const before = new Date('2026-11-23T08:59:00Z');
    expect(isWithinBusinessHours(before, hours, 'UTC')).toBe(false);

    // 09:00 UTC -> inside
    const start = new Date('2026-11-23T09:00:00Z');
    expect(isWithinBusinessHours(start, hours, 'UTC')).toBe(true);

    // 12:30 UTC -> inside
    const mid = new Date('2026-11-23T12:30:00Z');
    expect(isWithinBusinessHours(mid, hours, 'UTC')).toBe(true);

    // 17:00 UTC -> outside
    const end = new Date('2026-11-23T17:00:00Z');
    expect(isWithinBusinessHours(end, hours, 'UTC')).toBe(false);
  });

  it('correctly evaluates business hours with non-UTC timezone', () => {
    const hours = { start: '09:00', end: '17:00' };
    // Dhaka is UTC+6
    // 04:00 UTC is 10:00 in Asia/Dhaka -> inside
    const insideDhaka = new Date('2026-11-23T04:00:00Z');
    expect(isWithinBusinessHours(insideDhaka, hours, 'Asia/Dhaka')).toBe(true);

    // 12:00 UTC is 18:00 in Asia/Dhaka -> outside
    const outsideDhaka = new Date('2026-11-23T12:00:00Z');
    expect(isWithinBusinessHours(outsideDhaka, hours, 'Asia/Dhaka')).toBe(false);
  });

  it('handles overnight shifts (e.g. 22:00 to 06:00)', () => {
    const overnight = { start: '22:00', end: '06:00' };

    const night = new Date('2026-11-23T23:30:00Z');
    expect(isWithinBusinessHours(night, overnight, 'UTC')).toBe(true);

    const earlyMorning = new Date('2026-11-23T05:15:00Z');
    expect(isWithinBusinessHours(earlyMorning, overnight, 'UTC')).toBe(true);

    const noon = new Date('2026-11-23T12:00:00Z');
    expect(isWithinBusinessHours(noon, overnight, 'UTC')).toBe(false);
  });
});

