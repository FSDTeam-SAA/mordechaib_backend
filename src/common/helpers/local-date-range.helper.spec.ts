import {
  localDateKeys,
  localDayRange,
  localWeekRange,
  trailingLocalDaysRange,
} from './local-date-range.helper';

describe('local date range helpers', () => {
  it('calculates a local day in Dhaka', () => {
    expect(
      localDayRange(new Date('2026-09-22T06:00:00.000Z'), 'Asia/Dhaka'),
    ).toEqual({
      start: new Date('2026-09-21T18:00:00.000Z'),
      end: new Date('2026-09-22T18:00:00.000Z'),
      timezone: 'Asia/Dhaka',
    });
  });

  it('keeps trailing day boundaries correct across daylight-saving time', () => {
    const range = trailingLocalDaysRange(
      new Date('2026-03-10T12:00:00.000Z'),
      'America/New_York',
      3,
    );

    expect(range.start).toEqual(new Date('2026-03-08T05:00:00.000Z'));
    expect(range.end).toEqual(new Date('2026-03-11T04:00:00.000Z'));
    expect(localDateKeys(range.start, 3, range.timezone)).toEqual([
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });

  it('uses Monday as the first day of a local week', () => {
    expect(
      localWeekRange(new Date('2026-09-18T06:00:00.000Z'), 'Asia/Dhaka'),
    ).toEqual({
      start: new Date('2026-09-13T18:00:00.000Z'),
      end: new Date('2026-09-20T18:00:00.000Z'),
      timezone: 'Asia/Dhaka',
    });
  });
});
