import { NotFoundException } from '@nestjs/common';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CalendarService } from '../calendar/calendar.service';
import { PlatformMeetingsService } from '../meeting-bots/platform-meetings.service';
import { UsersService } from '../users/users.service';
import { AdminMeetingCalendarQuickActionsService } from './admin-meeting-calendar-quick-actions.service';
import { AdminMeetingOperationLeaseService } from './admin-meeting-operation-lease.service';

describe('AdminMeetingCalendarQuickActionsService', () => {
  const organizationId = '66cc9bdfa847ea856c7b4101';
  const organizerUserId = '66cc9bdfa847ea856c7b4102';
  const actor: RequestUser = {
    id: 'platform-admin-1',
    email: 'admin@noltra.ai',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'platform-org',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };
  let users: Record<string, jest.Mock>;
  let meetings: Record<string, jest.Mock>;
  let calendar: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;
  let leases: Record<string, jest.Mock>;
  let service: AdminMeetingCalendarQuickActionsService;

  beforeEach(() => {
    users = {
      findById: jest.fn().mockResolvedValue({
        _id: organizerUserId,
        organizationId,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
      }),
    };
    meetings = {
      create: jest.fn().mockResolvedValue({
        id: 'meeting-1',
        status: 'SCHEDULED',
      }),
    };
    calendar = {
      syncEvents: jest.fn().mockResolvedValue({
        availability: 'AVAILABLE',
        totalSynchronized: 4,
      }),
    };
    audits = { create: jest.fn().mockResolvedValue(undefined) };
    leases = {
      run: jest.fn().mockImplementation(({ execute }) => execute()),
    };
    service = new AdminMeetingCalendarQuickActionsService(
      users as unknown as UsersService,
      meetings as unknown as PlatformMeetingsService,
      calendar as unknown as CalendarService,
      audits as unknown as AuditLogsService,
      leases as unknown as AdminMeetingOperationLeaseService,
    );
  });

  it('schedules through the standard meeting workflow for a validated organizer', async () => {
    const input = {
      organizationId,
      organizerUserId,
      platform: MeetingPlatform.GOOGLE_MEET,
      title: 'Customer review',
      startsAt: '2026-11-20T09:00:00.000Z',
      timezone: 'Asia/Dhaka',
      idempotencyKey: 'admin-meeting-request-001',
    };

    await expect(service.schedule(actor, input)).resolves.toEqual({
      id: 'meeting-1',
      status: 'SCHEDULED',
    });
    expect(meetings.create).toHaveBeenCalledWith(
      organizationId,
      organizerUserId,
      expect.objectContaining({
        platform: MeetingPlatform.GOOGLE_MEET,
        title: 'Customer review',
      }),
    );
    expect(meetings.create.mock.calls[0][2]).not.toHaveProperty(
      'organizationId',
    );
    expect(meetings.create.mock.calls[0][2]).not.toHaveProperty(
      'organizerUserId',
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId: actor.id,
        action: 'PLATFORM_ADMIN_MEETING_CALENDAR_SCHEDULE',
      }),
    );
    expect(leases.run).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `meeting-create:${organizationId}:admin-meeting-request-001`,
      }),
    );
  });

  it('synchronizes through the standard calendar workflow', async () => {
    await service.sync(actor, {
      organizationId,
      organizerUserId,
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-12-01T00:00:00.000Z',
    });

    expect(calendar.syncEvents).toHaveBeenCalledWith(
      organizationId,
      organizerUserId,
      {
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-12-01T00:00:00.000Z',
      },
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_ADMIN_MEETING_CALENDAR_SYNC',
        metadata: expect.objectContaining({ totalSynchronized: 4 }),
      }),
    );
    expect(leases.run).toHaveBeenCalledWith(
      expect.objectContaining({ key: `calendar-sync:${organizationId}` }),
    );
  });

  it.each([
    {
      organizationId: 'different-org',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
    },
    {
      organizationId,
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
    },
    {
      organizationId,
      role: UserRole.ADMIN,
      status: UserStatus.SUSPENDED,
    },
  ])('rejects an ineligible target organizer: %o', async (organizer) => {
    users.findById.mockResolvedValue({ _id: organizerUserId, ...organizer });

    await expect(
      service.sync(actor, { organizationId, organizerUserId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(calendar.syncEvents).not.toHaveBeenCalled();
    expect(audits.create).not.toHaveBeenCalled();
  });
});
