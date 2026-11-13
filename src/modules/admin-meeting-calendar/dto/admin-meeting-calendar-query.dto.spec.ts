import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../../common/enums/admin-meeting-status.enum';
import { AdminMeetingCalendarQueryDto } from './admin-meeting-calendar-query.dto';

describe('AdminMeetingCalendarQueryDto', () => {
  it('normalizes a valid bounded-query contract', async () => {
    const dto = plainToInstance(AdminMeetingCalendarQueryDto, {
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-12-01T00:00:00.000Z',
      timezone: 'Asia/Dhaka',
      status: AdminMeetingStatus.CONFIRMED,
      sourceType: AdminMeetingSourceType.PLATFORM_MEETING,
      search: '  Acme review  ',
      page: '2',
      limit: '25',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        from: new Date('2026-11-01T00:00:00.000Z'),
        to: new Date('2026-12-01T00:00:00.000Z'),
        search: 'Acme review',
        page: 2,
        limit: 25,
      }),
    );
  });

  it('rejects invalid dates, timezone, status, and oversized pages', async () => {
    const dto = plainToInstance(AdminMeetingCalendarQueryDto, {
      from: 'not-a-date',
      to: 'not-a-date',
      timezone: 'Not/A-Timezone',
      status: 'UNKNOWN',
      limit: 500,
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['from', 'to', 'timezone', 'status', 'limit']),
    );
  });
});
