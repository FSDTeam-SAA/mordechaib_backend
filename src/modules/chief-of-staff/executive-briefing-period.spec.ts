import { ExecutiveBriefingType } from '../../common/enums/executive-briefing.enum';
import { executiveBriefingPeriod } from './executive-briefing-period';

describe('executiveBriefingPeriod', () => {
  it('uses local midnight boundaries for a Dhaka daily briefing', () => {
    expect(
      executiveBriefingPeriod(
        ExecutiveBriefingType.TODAY,
        new Date('2026-09-18T06:00:00.000Z'),
        'Asia/Dhaka',
      ),
    ).toEqual({
      start: '2026-09-17T18:00:00.000Z',
      end: '2026-09-18T18:00:00.000Z',
      timezone: 'Asia/Dhaka',
    });
  });

  it('uses Monday-to-Monday boundaries for a weekly review', () => {
    expect(
      executiveBriefingPeriod(
        ExecutiveBriefingType.WEEKLY_REVIEW,
        new Date('2026-09-18T06:00:00.000Z'),
        'Asia/Dhaka',
      ),
    ).toEqual({
      start: '2026-09-13T18:00:00.000Z',
      end: '2026-09-20T18:00:00.000Z',
      timezone: 'Asia/Dhaka',
    });
  });

  it('respects daylight-saving offsets', () => {
    expect(
      executiveBriefingPeriod(
        ExecutiveBriefingType.TODAY,
        new Date('2026-07-04T16:00:00.000Z'),
        'America/New_York',
      ),
    ).toEqual({
      start: '2026-07-04T04:00:00.000Z',
      end: '2026-07-05T04:00:00.000Z',
      timezone: 'America/New_York',
    });
  });
});
