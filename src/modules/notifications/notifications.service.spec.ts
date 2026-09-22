import { ConfigService } from '@nestjs/config';
import {
  NotificationEmailStatus,
  NotificationType,
} from '../../common/enums/notification-type.enum';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { SettingsService } from '../settings/settings.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

jest.mock('../../common/helpers/mailer.helper', () => ({
  sendEmail: jest.fn(),
}));

describe('NotificationsService', () => {
  const repository = {
    reserve: jest.fn(),
    updateEmailResult: jest.fn(),
    findActiveUserById: jest.fn(),
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    findActiveUsersBatch: jest.fn(),
  };
  const settings = { getNotifications: jest.fn() };
  const config = { get: jest.fn() };
  const service = new NotificationsService(
    repository as unknown as NotificationsRepository,
    settings as unknown as SettingsService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    settings.getNotifications.mockResolvedValue({
      userId: 'user-1',
      emailNotifications: true,
      inAppNotifications: true,
      agentTaskCompletions: true,
      meetingReminders: true,
      weeklyRoiReports: true,
      productUpdates: true,
    });
    repository.findActiveUserById.mockResolvedValue({
      _id: 'user-1',
      organizationId: 'org-1',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
    });
    repository.reserve.mockResolvedValue({
      created: true,
      record: { _id: 'notification-1' },
    });
    (sendEmail as jest.Mock).mockResolvedValue(true);
  });

  it('delivers an enabled meeting reminder to in-app and email channels', async () => {
    await service.notifyMeetingReminder({
      sourceType: 'PLATFORM_MEETING',
      sourceId: 'meeting-1',
      organizationId: 'org-1',
      userId: 'user-1',
      title: 'Quarterly review',
      startsAt: new Date('2099-10-01T03:00:00.000Z'),
      timezone: 'Asia/Dhaka',
    });

    expect(repository.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.MEETING_REMINDER,
        inAppVisible: true,
        emailStatus: NotificationEmailStatus.PENDING,
      }),
    );
    expect(sendEmail).toHaveBeenCalled();
    expect(repository.updateEmailResult).toHaveBeenCalledWith(
      'notification-1',
      NotificationEmailStatus.SENT,
      undefined,
    );
  });

  it('stores a dedupe record but suppresses disabled notification channels', async () => {
    settings.getNotifications.mockResolvedValue({
      userId: 'user-1',
      emailNotifications: true,
      inAppNotifications: true,
      agentTaskCompletions: true,
      meetingReminders: false,
      weeklyRoiReports: true,
      productUpdates: true,
    });

    await service.notifyMeetingReminder({
      sourceType: 'CALENDAR_EVENT',
      sourceId: 'meeting-2',
      organizationId: 'org-1',
      userId: 'user-1',
      title: 'Customer call',
      startsAt: new Date('2099-10-01T03:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(repository.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        inAppVisible: false,
        emailStatus: NotificationEmailStatus.SKIPPED,
      }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not resend email when the notification event already exists', async () => {
    repository.reserve.mockResolvedValue({
      created: false,
      record: { _id: 'notification-1' },
    });

    await service.notifyAgentTaskCompleted({
      _id: 'task-1',
      organizationId: 'org-1',
      title: 'Prepare quote',
      createdByUserId: 'user-1',
      proposedByAgent: { name: 'Steve' },
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(repository.updateEmailResult).not.toHaveBeenCalled();
  });
});

