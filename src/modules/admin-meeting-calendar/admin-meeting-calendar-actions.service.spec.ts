import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CalendarService } from '../calendar/calendar.service';
import { PlatformMeetingsService } from '../meeting-bots/platform-meetings.service';
import { AdminMeetingCalendarActionsService } from './admin-meeting-calendar-actions.service';
import { AdminMeetingCalendarRepository } from './admin-meeting-calendar.repository';
import { AdminMeetingOperationLeaseService } from './admin-meeting-operation-lease.service';

describe('AdminMeetingCalendarActionsService', () => {
  const actor: RequestUser = {
    id: 'admin-1',
    email: 'admin@noltra.ai',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'admin-org',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };
  const now = new Date('2026-11-13T06:00:00.000Z');
  const baseTarget = {
    id: '66cc9bdfa847ea856c7b41d2',
    sourceType: AdminMeetingSourceType.PLATFORM_MEETING,
    organizationId: 'customer-org',
    rawStatus: PlatformMeetingStatus.SCHEDULED,
    status: AdminMeetingStatus.CONFIRMED,
    startsAt: new Date('2026-11-13T05:30:00.000Z'),
    endsAt: new Date('2026-11-13T06:30:00.000Z'),
    capabilities: {
      canComplete: true,
      canCancel: true,
      canDelete: false,
    },
  };
  let repository: Record<string, jest.Mock>;
  let platformMeetings: Record<string, jest.Mock>;
  let calendar: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;
  let leases: Record<string, jest.Mock>;
  let service: AdminMeetingCalendarActionsService;

  beforeEach(() => {
    repository = {
      findActionTarget: jest.fn().mockResolvedValue(baseTarget),
    };
    platformMeetings = {
      completeAsPlatformAdmin: jest.fn().mockResolvedValue({}),
      cancelAsPlatformAdmin: jest.fn().mockResolvedValue({}),
      deletePermanentAsPlatformAdmin: jest.fn().mockResolvedValue({}),
    };
    calendar = { cancelEvent: jest.fn().mockResolvedValue({}) };
    audits = { create: jest.fn().mockResolvedValue(undefined) };
    leases = {
      run: jest.fn().mockImplementation(({ execute }) => execute()),
    };
    service = new AdminMeetingCalendarActionsService(
      repository as unknown as AdminMeetingCalendarRepository,
      platformMeetings as unknown as PlatformMeetingsService,
      calendar as unknown as CalendarService,
      audits as unknown as AuditLogsService,
      leases as unknown as AdminMeetingOperationLeaseService,
    );
  });

  it('completes an eligible platform meeting and records an audit', async () => {
    await expect(
      service.complete(
        actor,
        AdminMeetingSourceType.PLATFORM_MEETING,
        baseTarget.id,
        now,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        action: 'COMPLETE',
        status: AdminMeetingStatus.COMPLETED,
        organizationId: 'customer-org',
      }),
    );
    expect(platformMeetings.completeAsPlatformAdmin).toHaveBeenCalledWith(
      'customer-org',
      baseTarget.id,
      now,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'customer-org',
        userId: actor.id,
        action: 'PLATFORM_ADMIN_MEETING_COMPLETE',
      }),
    );
    expect(leases.run).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `calendar-item:PLATFORM_MEETING:${baseTarget.id}`,
        operation: 'COMPLETE',
        actorUserId: actor.id,
      }),
    );
  });

  it('uses provider-backed cancellation for calendar-only events', async () => {
    repository.findActionTarget.mockResolvedValue({
      ...baseTarget,
      sourceType: AdminMeetingSourceType.CALENDAR_EVENT,
      capabilities: {
        canComplete: false,
        canCancel: true,
        canDelete: false,
      },
    });

    await service.cancel(
      actor,
      AdminMeetingSourceType.CALENDAR_EVENT,
      baseTarget.id,
      now,
    );

    expect(calendar.cancelEvent).toHaveBeenCalledWith(
      'customer-org',
      baseTarget.id,
    );
    expect(platformMeetings.cancelAsPlatformAdmin).not.toHaveBeenCalled();
  });

  it('permanently deletes only an eligible terminal platform meeting', async () => {
    repository.findActionTarget.mockResolvedValue({
      ...baseTarget,
      rawStatus: PlatformMeetingStatus.CANCELLED,
      status: AdminMeetingStatus.CANCELLED,
      capabilities: {
        canComplete: false,
        canCancel: false,
        canDelete: true,
      },
    });

    await expect(
      service.delete(
        actor,
        AdminMeetingSourceType.PLATFORM_MEETING,
        baseTarget.id,
        now,
      ),
    ).resolves.toEqual(expect.objectContaining({ deleted: true }));
    expect(
      platformMeetings.deletePermanentAsPlatformAdmin,
    ).toHaveBeenCalledWith('customer-org', baseTarget.id);
  });

  it('blocks an action when its server-derived capability is false', async () => {
    repository.findActionTarget.mockResolvedValue({
      ...baseTarget,
      capabilities: {
        canComplete: false,
        canCancel: false,
        canDelete: false,
      },
    });

    await expect(
      service.cancel(
        actor,
        AdminMeetingSourceType.PLATFORM_MEETING,
        baseTarget.id,
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(platformMeetings.cancelAsPlatformAdmin).not.toHaveBeenCalled();
    expect(audits.create).not.toHaveBeenCalled();
  });

  it('does not reveal whether an unknown source id exists elsewhere', async () => {
    repository.findActionTarget.mockResolvedValue(undefined);
    await expect(
      service.complete(
        actor,
        AdminMeetingSourceType.PLATFORM_MEETING,
        baseTarget.id,
        now,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
