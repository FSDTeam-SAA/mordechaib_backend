import { AdminMeetingStatus } from '../../common/enums/admin-meeting-status.enum';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import {
  calendarStatusesForAdminStatus,
  platformStatusesForAdminStatus,
  toAdminCalendarEventStatus,
  toAdminPlatformMeetingStatus,
} from './admin-meeting-status.mapper';

describe('admin meeting status mapper', () => {
  it.each([
    [PlatformMeetingStatus.CREATING, AdminMeetingStatus.PENDING],
    [PlatformMeetingStatus.READY, AdminMeetingStatus.CONFIRMED],
    [PlatformMeetingStatus.SCHEDULED, AdminMeetingStatus.CONFIRMED],
    [PlatformMeetingStatus.COMPLETED, AdminMeetingStatus.COMPLETED],
    [PlatformMeetingStatus.CANCELLED, AdminMeetingStatus.CANCELLED],
    [PlatformMeetingStatus.FAILED, AdminMeetingStatus.FAILED],
  ])('normalizes platform status %s', (input, expected) => {
    expect(toAdminPlatformMeetingStatus(input)).toBe(expected);
  });

  it.each([
    [CalendarEventStatus.CREATING, AdminMeetingStatus.PENDING],
    [CalendarEventStatus.SCHEDULED, AdminMeetingStatus.CONFIRMED],
    [CalendarEventStatus.CANCELLED, AdminMeetingStatus.CANCELLED],
    [CalendarEventStatus.FAILED, AdminMeetingStatus.FAILED],
  ])('normalizes calendar status %s', (input, expected) => {
    expect(toAdminCalendarEventStatus(input)).toBe(expected);
  });

  it('expands a normalized status into provider query statuses', () => {
    expect(
      platformStatusesForAdminStatus(AdminMeetingStatus.CONFIRMED),
    ).toEqual([PlatformMeetingStatus.READY, PlatformMeetingStatus.SCHEDULED]);
    expect(
      calendarStatusesForAdminStatus(AdminMeetingStatus.CONFIRMED),
    ).toEqual([CalendarEventStatus.SCHEDULED]);
    expect(
      calendarStatusesForAdminStatus(AdminMeetingStatus.COMPLETED),
    ).toEqual([]);
  });
});
