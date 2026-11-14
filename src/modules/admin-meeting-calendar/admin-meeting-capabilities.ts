import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';

export type AdminMeetingCapabilities = {
  canComplete: boolean;
  canCancel: boolean;
  canDelete: boolean;
};

const ACTIVE_PLATFORM_STATUSES = new Set<PlatformMeetingStatus>([
  PlatformMeetingStatus.READY,
  PlatformMeetingStatus.SCHEDULED,
]);

const TERMINAL_PLATFORM_STATUSES = new Set<PlatformMeetingStatus>([
  PlatformMeetingStatus.COMPLETED,
  PlatformMeetingStatus.CANCELLED,
  PlatformMeetingStatus.FAILED,
]);

export function adminMeetingCapabilities(input: {
  sourceType: AdminMeetingSourceType;
  rawStatus: PlatformMeetingStatus | CalendarEventStatus;
  status: AdminMeetingStatus;
  startsAt: Date;
  now: Date;
}): AdminMeetingCapabilities {
  if (input.sourceType === AdminMeetingSourceType.PLATFORM_MEETING) {
    const rawStatus = input.rawStatus as PlatformMeetingStatus;
    const active = ACTIVE_PLATFORM_STATUSES.has(rawStatus);
    return {
      canComplete: active && input.startsAt.getTime() <= input.now.getTime(),
      canCancel: active && input.status === AdminMeetingStatus.CONFIRMED,
      canDelete: TERMINAL_PLATFORM_STATUSES.has(rawStatus),
    };
  }

  const rawStatus = input.rawStatus as CalendarEventStatus;
  return {
    canComplete: false,
    canCancel:
      rawStatus === CalendarEventStatus.SCHEDULED &&
      input.status === AdminMeetingStatus.CONFIRMED,
    canDelete: false,
  };
}
