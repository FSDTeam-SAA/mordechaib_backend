import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { isValidObjectId } from 'mongoose';
import {
  NotificationEmailStatus,
  NotificationType,
} from '../../common/enums/notification-type.enum';
import { sendEmail } from '../../common/helpers/mailer.helper';
import {
  NotificationPreferencesView,
  SettingsService,
} from '../settings/settings.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { PublishProductUpdateDto } from './dto/publish-product-update.dto';
import { NotificationsRepository } from './notifications.repository';

type PreferenceKey = keyof Pick<
  NotificationPreferencesView,
  | 'agentTaskCompletions'
  | 'meetingReminders'
  | 'weeklyRoiReports'
  | 'productUpdates'
>;

type DeliveryInput = {
  organizationId: string;
  userId: string;
  email?: string;
  recipientName?: string;
  type: NotificationType;
  preference: PreferenceKey;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  dedupeKey: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async list(
    organizationId: string,
    userId: string,
    query: ListNotificationsQueryDto,
  ) {
    const result = await this.repository.list(organizationId, userId, query);
    return { ...result, items: result.items.map((item) => this.toResponse(item)) };
  }

  async unreadCount(organizationId: string, userId: string) {
    return {
      unreadCount: await this.repository.unreadCount(organizationId, userId),
    };
  }

  async markRead(organizationId: string, userId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Notification not found');
    const notification = await this.repository.markRead(
      organizationId,
      userId,
      id,
    );
    if (!notification) throw new NotFoundException('Notification not found');
    return this.toResponse(notification);
  }

  async markUnread(organizationId: string, userId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Notification not found');
    const notification = await this.repository.markUnread(
      organizationId,
      userId,
      id,
    );
    if (!notification) throw new NotFoundException('Notification not found');
    return this.toResponse(notification);
  }

  async markAllRead(organizationId: string, userId: string) {
    const result = await this.repository.markAllRead(organizationId, userId);
    return { updatedCount: result.modifiedCount };
  }

  async notifyAgentTaskCompleted(task: {
    _id: unknown;
    organizationId: string;
    title: string;
    createdByUserId: string;
    assignedToUserId?: string;
    proposedByAgent?: { name?: string };
  }) {
    const recipientIds = [task.createdByUserId, task.assignedToUserId].filter(
      (value, index, values): value is string =>
        Boolean(value) && values.indexOf(value) === index,
    );
    await Promise.allSettled(
      recipientIds.map(async (userId) => {
        const user = await this.repository.findActiveUserById(userId);
        if (!user) return;
        const agentName = task.proposedByAgent?.name || 'An AI agent';
        await this.deliver({
          organizationId: task.organizationId,
          userId,
          email: user.email,
          recipientName: this.userName(user),
          type: NotificationType.AGENT_TASK_COMPLETED,
          preference: 'agentTaskCompletions',
          title: 'Agent task completed',
          message: `${agentName} completed “${task.title}”.`,
          actionUrl: `/tasks/${String(task._id)}`,
          metadata: { taskId: String(task._id) },
          dedupeKey: `AGENT_TASK_COMPLETED:${String(task._id)}:${userId}`,
        });
      }),
    );
  }

  async notifyMeetingReminder(meeting: {
    sourceType: string;
    sourceId: string;
    organizationId: string;
    userId: string;
    title: string;
    startsAt: Date;
    timezone: string;
  }) {
    const user = await this.repository.findActiveUserById(meeting.userId);
    if (!user) return;
    const startText = this.formatDateTime(meeting.startsAt, meeting.timezone);
    await this.deliver({
      organizationId: meeting.organizationId,
      userId: meeting.userId,
      email: user.email,
      recipientName: this.userName(user),
      type: NotificationType.MEETING_REMINDER,
      preference: 'meetingReminders',
      title: 'Meeting starts in about 1 hour',
      message: `“${meeting.title}” starts at ${startText}.`,
      actionUrl: '/calendar',
      metadata: {
        sourceType: meeting.sourceType,
        sourceId: meeting.sourceId,
        startsAt: meeting.startsAt.toISOString(),
      },
      dedupeKey: `MEETING_REMINDER:${meeting.sourceType}:${meeting.sourceId}:${meeting.userId}`,
    });
  }

  async notifyWeeklyRoiReport(
    user: {
      _id: unknown;
      organizationId: string;
      email: string;
      firstName: string;
      lastName: string;
    },
    weekKey: string,
    summary: { completedTasks: number; aiAssistedTasks: number },
  ) {
    await this.deliver({
      organizationId: user.organizationId,
      userId: String(user._id),
      email: user.email,
      recipientName: this.userName(user),
      type: NotificationType.WEEKLY_ROI_REPORT,
      preference: 'weeklyRoiReports',
      title: 'Your weekly ROI activity summary is ready',
      message:
        `${summary.completedTasks} tasks were completed this week, including ` +
        `${summary.aiAssistedTasks} AI-assisted tasks.`,
      actionUrl: '/roi-dashboard',
      metadata: { weekKey, ...summary },
      dedupeKey: `WEEKLY_ROI_REPORT:${weekKey}:${String(user._id)}`,
    });
  }

  async publishProductUpdate(
    dto: PublishProductUpdateDto,
    publishedBy: string,
  ) {
    const campaignId = randomUUID();
    let afterId: string | undefined;
    let targetedUsers = 0;
    let hasMore = true;

    while (hasMore) {
      const users = await this.repository.findActiveUsersBatch(afterId, 100);
      if (users.length === 0) break;
      targetedUsers += users.length;
      await Promise.allSettled(
        users.map((user) =>
          this.deliver({
            organizationId: user.organizationId,
            userId: String(user._id),
            email: user.email,
            recipientName: this.userName(user),
            type: NotificationType.PRODUCT_UPDATE,
            preference: 'productUpdates',
            title: dto.title.trim(),
            message: dto.message.trim(),
            actionUrl: dto.actionUrl,
            metadata: { campaignId, publishedBy },
            dedupeKey: `PRODUCT_UPDATE:${campaignId}:${String(user._id)}`,
          }),
        ),
      );
      afterId = String(users.at(-1)!._id);
      hasMore = users.length === 100;
    }

    return { campaignId, targetedUsers };
  }

  private async deliver(input: DeliveryInput) {
    const preferences = await this.settings.getNotifications(input.userId);
    const categoryEnabled = preferences[input.preference];
    const inAppVisible = categoryEnabled && preferences.inAppNotifications;
    const shouldEmail = Boolean(
      categoryEnabled && preferences.emailNotifications && input.email,
    );
    const reservation = await this.repository.reserve({
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
      metadata: input.metadata,
      dedupeKey: input.dedupeKey,
      inAppVisible,
      emailStatus: shouldEmail
        ? NotificationEmailStatus.PENDING
        : NotificationEmailStatus.SKIPPED,
    });
    if (!reservation.created || !shouldEmail || !input.email) {
      return reservation.record;
    }

    try {
      const sent = await sendEmail(this.config, {
        to: input.email,
        subject: input.title,
        ...this.emailContent(input),
      });
      await this.repository.updateEmailResult(
        String(reservation.record!._id),
        sent
          ? NotificationEmailStatus.SENT
          : NotificationEmailStatus.FAILED,
        sent ? undefined : 'Email transport did not accept the message',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.updateEmailResult(
        String(reservation.record!._id),
        NotificationEmailStatus.FAILED,
        message,
      );
      this.logger.warn(`Notification email failed: ${message}`);
    }
    return reservation.record;
  }

  private emailContent(input: DeliveryInput) {
    const name = this.escapeHtml(input.recipientName || 'there');
    const title = this.escapeHtml(input.title);
    const message = this.escapeHtml(input.message);
    const actionUrl = this.absoluteActionUrl(input.actionUrl);
    const action = actionUrl
      ? `<p><a href="${this.escapeHtml(actionUrl)}">Open Noltra</a></p>`
      : '';
    return {
      text: `Hi ${input.recipientName || 'there'},\n\n${input.message}${
        actionUrl ? `\n\n${actionUrl}` : ''
      }`,
      html: `<p>Hi ${name},</p><h2>${title}</h2><p>${message}</p>${action}`,
    };
  }

  private absoluteActionUrl(actionUrl?: string) {
    if (!actionUrl) return undefined;
    if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
    const frontendUrl = this.config.get<string>('mail.frontendUrl');
    return frontendUrl
      ? `${frontendUrl.replace(/\/$/, '')}/${actionUrl.replace(/^\//, '')}`
      : undefined;
  }

  private formatDateTime(value: Date, timezone: string) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(value);
    } catch {
      return value.toISOString();
    }
  }

  private userName(user: { firstName: string; lastName: string }) {
    return `${user.firstName} ${user.lastName}`.trim();
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private toResponse(notification: Record<string, unknown>) {
    const {
      _id,
      __v,
      organizationId,
      userId,
      dedupeKey,
      inAppVisible,
      emailStatus,
      emailSentAt,
      emailFailureMessage,
      ...response
    } = notification;
    void __v;
    void organizationId;
    void userId;
    void dedupeKey;
    void inAppVisible;
    void emailStatus;
    void emailSentAt;
    void emailFailureMessage;
    return { id: String(_id), ...response };
  }
}
