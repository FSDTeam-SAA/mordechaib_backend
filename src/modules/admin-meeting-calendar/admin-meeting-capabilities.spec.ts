import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { adminMeetingCapabilities } from './admin-meeting-capabilities';

describe('adminMeetingCapabilities', () => {
  const now = new Date('2026-11-13T06:00:00.000Z');

  it('allows a started active platform meeting to be completed', () => {
    expect(
      adminMeetingCapabilities({
        sourceType: AdminMeetingSourceType.PLATFORM_MEETING,
        rawStatus: PlatformMeetingStatus.SCHEDULED,
        status: AdminMeetingStatus.CONFIRMED,
        startsAt: new Date('2026-11-13T05:30:00.000Z'),
        now,
      }),
    ).toEqual({ canComplete: true, canCancel: true, canDelete: false });
  });

  it('allows only cancellation for a future synchronized event', () => {
    expect(
      adminMeetingCapabilities({
        sourceType: AdminMeetingSourceType.CALENDAR_EVENT,
        rawStatus: CalendarEventStatus.SCHEDULED,
        status: AdminMeetingStatus.CONFIRMED,
        startsAt: new Date('2026-11-20T05:30:00.000Z'),
        now,
      }),
    ).toEqual({ canComplete: false, canCancel: true, canDelete: false });
  });

  it('allows permanent deletion only for terminal platform records', () => {
    expect(
      adminMeetingCapabilities({
        sourceType: AdminMeetingSourceType.PLATFORM_MEETING,
        rawStatus: PlatformMeetingStatus.FAILED,
        status: AdminMeetingStatus.FAILED,
        startsAt: new Date('2026-11-12T05:30:00.000Z'),
        now,
      }),
    ).toEqual({ canComplete: false, canCancel: false, canDelete: true });
  });
});
