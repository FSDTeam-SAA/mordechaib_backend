import { BadRequestException } from '@nestjs/common';
import { resolveMetaTimeRange } from './meta-date-filter.util';

const unix = (value: string) => Math.floor(Date.parse(value) / 1000);

describe('resolveMetaTimeRange', () => {
  it('returns no upstream filter when no date input is supplied', () => {
    expect(resolveMetaTimeRange({})).toEqual({});
  });

  it('resolves a single UTC calendar day inclusively', () => {
    expect(resolveMetaTimeRange({ date: '2026-08-28' })).toEqual({
      since: unix('2026-08-28T00:00:00Z'),
      until: unix('2026-08-28T23:59:59Z'),
    });
  });

  it('resolves a date and time range in the requested UTC offset', () => {
    expect(
      resolveMetaTimeRange({
        fromDate: '2026-08-01',
        toDate: '2026-08-28',
        startTime: '09:15',
        endTime: '17:30',
        timezoneOffset: '+06:00',
      }),
    ).toEqual({
      since: unix('2026-08-01T03:15:00Z'),
      until: unix('2026-08-28T11:30:59Z'),
    });
  });

  it.each([
    {
      input: { date: '2026-08-28', fromDate: '2026-08-01' },
      message: 'date cannot be combined',
    },
    {
      input: { fromDate: '2026-08-01' },
      message: 'fromDate and toDate must be provided together',
    },
    {
      input: { startTime: '09:00' },
      message: 'require date',
    },
    {
      input: { timezoneOffset: '+06:00' },
      message: 'timezoneOffset requires date',
    },
    {
      input: {
        date: '2026-08-28',
        startTime: '18:00',
        endTime: '09:00',
      },
      message: 'must be before',
    },
  ])('rejects an invalid filter combination', ({ input, message }) => {
    expect(() => resolveMetaTimeRange(input)).toThrow(BadRequestException);
    expect(() => resolveMetaTimeRange(input)).toThrow(message);
  });
});
