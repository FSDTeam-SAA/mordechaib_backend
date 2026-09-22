import { NotificationsRepository } from './notifications.repository';
import { NotificationsScheduler } from './notifications.scheduler';
import { NotificationsService } from './notifications.service';

describe('NotificationsScheduler', () => {
  const repository = {
    findMeetingsStartingBetween: jest.fn(),
    findActiveUsersBatch: jest.fn(),
    findOrganizationTimezones: jest.fn(),
    weeklyRoiActivitySummary: jest.fn(),
  };
  const notifications = {
    notifyMeetingReminder: jest.fn(),
    notifyWeeklyRoiReport: jest.fn(),
  };
  const scheduler = new NotificationsScheduler(
    repository as unknown as NotificationsRepository,
    notifications as unknown as NotificationsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('scans the one-hour meeting reminder window', async () => {
    const meeting = {
      sourceType: 'PLATFORM_MEETING',
      sourceId: 'meeting-1',
      organizationId: 'org-1',
      userId: 'user-1',
      title: 'Review',
      startsAt: new Date('2026-09-21T04:00:00.000Z'),
      timezone: 'Asia/Dhaka',
    };
    repository.findMeetingsStartingBetween.mockResolvedValue([meeting]);

    await scheduler.sendMeetingReminders(
      new Date('2026-09-21T03:00:00.000Z'),
    );

    expect(repository.findMeetingsStartingBetween).toHaveBeenCalledWith(
      new Date('2026-09-21T03:55:00.000Z'),
      new Date('2026-09-21T04:05:00.000Z'),
    );
    expect(notifications.notifyMeetingReminder).toHaveBeenCalledWith(meeting);
  });

  it('sends the weekly summary at Monday 9 AM in the user timezone', async () => {
    const user = {
      _id: 'user-1',
      organizationId: 'org-1',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      timezone: 'Asia/Dhaka',
    };
    repository.findActiveUsersBatch.mockResolvedValue([user]);
    repository.findOrganizationTimezones.mockResolvedValue([]);
    repository.weeklyRoiActivitySummary.mockResolvedValue({
      completedTasks: 4,
      aiAssistedTasks: 2,
    });

    await scheduler.sendWeeklyRoiReports(
      new Date('2026-09-21T03:00:00.000Z'),
    );

    expect(notifications.notifyWeeklyRoiReport).toHaveBeenCalledWith(
      user,
      '2026-09-21',
      { completedTasks: 4, aiAssistedTasks: 2 },
    );
  });
});

