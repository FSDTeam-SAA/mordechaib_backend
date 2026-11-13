import { AdminMeetingStatus } from '../../common/enums/admin-meeting-status.enum';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';

const PLATFORM_STATUS_MAP: Record<PlatformMeetingStatus, AdminMeetingStatus> = {
  [PlatformMeetingStatus.CREATING]: AdminMeetingStatus.PENDING,
  [PlatformMeetingStatus.READY]: AdminMeetingStatus.CONFIRMED,
  [PlatformMeetingStatus.SCHEDULED]: AdminMeetingStatus.CONFIRMED,
  [PlatformMeetingStatus.COMPLETED]: AdminMeetingStatus.COMPLETED,
  [PlatformMeetingStatus.CANCELLED]: AdminMeetingStatus.CANCELLED,
  [PlatformMeetingStatus.FAILED]: AdminMeetingStatus.FAILED,
};

const CALENDAR_STATUS_MAP: Record<CalendarEventStatus, AdminMeetingStatus> = {
  [CalendarEventStatus.CREATING]: AdminMeetingStatus.PENDING,
  [CalendarEventStatus.SCHEDULED]: AdminMeetingStatus.CONFIRMED,
  [CalendarEventStatus.CANCELLED]: AdminMeetingStatus.CANCELLED,
  [CalendarEventStatus.FAILED]: AdminMeetingStatus.FAILED,
};

export const toAdminPlatformMeetingStatus = (
  status: PlatformMeetingStatus,
): AdminMeetingStatus => PLATFORM_STATUS_MAP[status];

export const toAdminCalendarEventStatus = (
  status: CalendarEventStatus,
): AdminMeetingStatus => CALENDAR_STATUS_MAP[status];

export const platformStatusesForAdminStatus = (
  status: AdminMeetingStatus,
): PlatformMeetingStatus[] =>
  (
    Object.entries(PLATFORM_STATUS_MAP) as Array<
      [PlatformMeetingStatus, AdminMeetingStatus]
    >
  )
    .filter(([, normalized]) => normalized === status)
    .map(([providerStatus]) => providerStatus);

export const calendarStatusesForAdminStatus = (
  status: AdminMeetingStatus,
): CalendarEventStatus[] =>
  (
    Object.entries(CALENDAR_STATUS_MAP) as Array<
      [CalendarEventStatus, AdminMeetingStatus]
    >
  )
    .filter(([, normalized]) => normalized === status)
    .map(([providerStatus]) => providerStatus);
