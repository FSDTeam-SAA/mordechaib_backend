import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CalendarService } from '../calendar/calendar.service';
import { PlatformMeetingsService } from '../meeting-bots/platform-meetings.service';
import { UsersService } from '../users/users.service';
import { AdminScheduleMeetingDto } from './dto/admin-schedule-meeting.dto';
import { AdminSyncCalendarDto } from './dto/admin-sync-calendar.dto';

@Injectable()
export class AdminMeetingCalendarQuickActionsService {
  constructor(
    private readonly users: UsersService,
    private readonly meetings: PlatformMeetingsService,
    private readonly calendar: CalendarService,
    private readonly audits: AuditLogsService,
  ) {}

  async schedule(actor: RequestUser, input: AdminScheduleMeetingDto) {
    const organizer = await this.requireOrganizer(
      input.organizationId,
      input.organizerUserId,
    );
    const {
      organizationId,
      organizerUserId: _organizerUserId,
      ...meeting
    } = input;
    const result = await this.meetings.create(
      organizationId,
      String(organizer._id),
      meeting,
    );
    await this.audit(actor, organizationId, 'SCHEDULE', {
      organizerUserId: String(organizer._id),
      meetingId: this.resourceId(result),
      platform: meeting.platform,
    });
    return result;
  }

  async sync(actor: RequestUser, input: AdminSyncCalendarDto) {
    const organizer = await this.requireOrganizer(
      input.organizationId,
      input.organizerUserId,
    );
    const {
      organizationId,
      organizerUserId: _organizerUserId,
      ...syncInput
    } = input;
    const result = await this.calendar.syncEvents(
      organizationId,
      String(organizer._id),
      syncInput,
    );
    await this.audit(actor, organizationId, 'SYNC', {
      organizerUserId: String(organizer._id),
      provider: syncInput.provider || 'ALL_CONNECTED',
      availability: result.availability,
      totalSynchronized: result.totalSynchronized,
    });
    return result;
  }

  private async requireOrganizer(organizationId: string, userId: string) {
    const organizer = await this.users.findById(userId);
    if (
      !organizer ||
      organizer.organizationId !== organizationId ||
      organizer.status !== UserStatus.ACTIVE ||
      ![UserRole.OWNER, UserRole.ADMIN].includes(organizer.role)
    ) {
      throw new NotFoundException(
        'Active organization owner or admin not found',
      );
    }
    return organizer;
  }

  private audit(
    actor: RequestUser,
    organizationId: string,
    action: 'SCHEDULE' | 'SYNC',
    metadata: Record<string, unknown>,
  ) {
    return this.audits.create({
      organizationId,
      userId: actor.id,
      action: `PLATFORM_ADMIN_MEETING_CALENDAR_${action}`,
      resourceType: 'MEETING_CALENDAR',
      metadata: {
        platformAdmin: true,
        actorOrganizationId: actor.organizationId,
        ...metadata,
      },
    });
  }

  private resourceId(value: unknown) {
    if (!value || typeof value !== 'object') return undefined;
    const row = value as Record<string, unknown>;
    const id = row.id ?? row._id;
    return id === undefined || id === null ? undefined : String(id);
  }
}
