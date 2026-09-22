import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 */5 * * * *')
  async sendMeetingReminders(now = new Date()) {
    const from = new Date(now.getTime() + 55 * 60_000);
    const to = new Date(now.getTime() + 65 * 60_000);
    try {
      const meetings = await this.repository.findMeetingsStartingBetween(
        from,
        to,
      );
      const results = await Promise.allSettled(
        meetings.map((meeting) =>
          this.notifications.notifyMeetingReminder(meeting),
        ),
      );
      this.logRejected('meeting reminder', results);
    } catch (error) {
      this.logger.error(`Meeting reminder scan failed: ${this.message(error)}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sendWeeklyRoiReports(now = new Date()) {
    try {
      let afterId: string | undefined;
      const summaryCache = new Map<
        string,
        { completedTasks: number; aiAssistedTasks: number }
      >();
      let hasMore = true;

      while (hasMore) {
        const users = await this.repository.findActiveUsersBatch(afterId, 100);
        if (users.length === 0) break;
        const organizationIds = [
          ...new Set(users.map((user) => user.organizationId)),
        ];
        const organizations =
          await this.repository.findOrganizationTimezones(organizationIds);
        const organizationTimezones = new Map(
          organizations.map((organization) => [
            String(organization._id),
            organization.timezone,
          ]),
        );

        const eligible = users
          .map((user) => {
            const timezone =
              user.timezone ||
              organizationTimezones.get(user.organizationId) ||
              'UTC';
            return { user, local: this.localScheduleParts(now, timezone) };
          })
          .filter(({ local }) => local.weekday === 'Mon' && local.hour === 9);

        const results = await Promise.allSettled(
          eligible.map(async ({ user, local }) => {
            let summary = summaryCache.get(user.organizationId);
            if (!summary) {
              const since = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
              summary = await this.repository.weeklyRoiActivitySummary(
                user.organizationId,
                since,
              );
              summaryCache.set(user.organizationId, summary);
            }
            await this.notifications.notifyWeeklyRoiReport(
              user,
              local.date,
              summary,
            );
          }),
        );
        this.logRejected('weekly ROI notification', results);

        afterId = String(users.at(-1)!._id);
        hasMore = users.length === 100;
      }
    } catch (error) {
      this.logger.error(
        `Weekly ROI notification scan failed: ${this.message(error)}`,
      );
    }
  }

  private localScheduleParts(value: Date, timezone: string) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(value);
      const read = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value || '';
      return {
        weekday: read('weekday'),
        hour: Number(read('hour')),
        date: `${read('year')}-${read('month')}-${read('day')}`,
      };
    } catch {
      return {
        weekday: new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          weekday: 'short',
        }).format(value),
        hour: value.getUTCHours(),
        date: value.toISOString().slice(0, 10),
      };
    }
  }

  private logRejected(context: string, results: PromiseSettledResult<unknown>[]) {
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed.length) {
      this.logger.warn(
        `${failed.length} ${context} delivery attempt(s) failed`,
      );
    }
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
