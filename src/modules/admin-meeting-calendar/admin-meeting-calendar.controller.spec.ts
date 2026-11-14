import { AdminMeetingSourceType } from '../../common/enums/admin-meeting-status.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AdminMeetingCalendarActionsService } from './admin-meeting-calendar-actions.service';
import { AdminMeetingCalendarQuickActionsService } from './admin-meeting-calendar-quick-actions.service';
import { AdminMeetingCalendarController } from './admin-meeting-calendar.controller';
import { AdminMeetingCalendarService } from './admin-meeting-calendar.service';
import { AdminMeetingCalendarQueryDto } from './dto/admin-meeting-calendar-query.dto';

describe('AdminMeetingCalendarController', () => {
  const user: RequestUser = {
    id: 'platform-admin-1',
    email: 'admin@noltra.ai',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'platform-org',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };
  let calendar: Record<string, jest.Mock>;
  let actions: Record<string, jest.Mock>;
  let quickActions: Record<string, jest.Mock>;
  let controller: AdminMeetingCalendarController;

  beforeEach(() => {
    calendar = { dashboard: jest.fn().mockResolvedValue({}) };
    actions = {
      complete: jest.fn().mockResolvedValue({}),
      cancel: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };
    quickActions = {
      schedule: jest.fn().mockResolvedValue({}),
      sync: jest.fn().mockResolvedValue({}),
    };
    controller = new AdminMeetingCalendarController(
      calendar as unknown as AdminMeetingCalendarService,
      actions as unknown as AdminMeetingCalendarActionsService,
      quickActions as unknown as AdminMeetingCalendarQuickActionsService,
    );
  });

  it('delegates the dashboard query without changing its scope', async () => {
    const query = {
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
      timezone: 'Asia/Dhaka',
      page: 1,
      limit: 50,
    } as AdminMeetingCalendarQueryDto;

    await controller.dashboard(query);
    expect(calendar.dashboard).toHaveBeenCalledWith(query);
  });

  it('delegates meeting creation with the authenticated platform admin', async () => {
    const input = {
      organizationId: '66cc9bdfa847ea856c7b4101',
      organizerUserId: '66cc9bdfa847ea856c7b4102',
      platform: MeetingPlatform.GOOGLE_MEET,
      title: 'Customer review',
      idempotencyKey: 'request-001',
    };

    await controller.schedule(user, input);
    expect(quickActions.schedule).toHaveBeenCalledWith(user, input);
  });

  it('delegates organization synchronization with the authenticated admin', async () => {
    const input = {
      organizationId: '66cc9bdfa847ea856c7b4101',
      organizerUserId: '66cc9bdfa847ea856c7b4102',
    };

    await controller.sync(user, input);
    expect(quickActions.sync).toHaveBeenCalledWith(user, input);
  });

  it.each([
    ['complete', 'complete'],
    ['cancel', 'cancel'],
    ['delete', 'delete'],
  ] as const)(
    'delegates the %s command using source identity',
    async (method, dependency) => {
      await controller[method](
        user,
        AdminMeetingSourceType.PLATFORM_MEETING,
        '66cc9bdfa847ea856c7b41d2',
      );

      expect(actions[dependency]).toHaveBeenCalledWith(
        user,
        AdminMeetingSourceType.PLATFORM_MEETING,
        '66cc9bdfa847ea856c7b41d2',
      );
    },
  );
});
