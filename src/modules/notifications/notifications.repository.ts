import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import {
  NotificationEmailStatus,
  NotificationReadFilter,
  NotificationType,
} from '../../common/enums/notification-type.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { Notification } from '../../database/schemas/notification.schema';
import { OnboardingSetup } from '../../database/schemas/onboarding-setup.schema';
import { Organization } from '../../database/schemas/organization.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { User } from '../../database/schemas/user.schema';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

type ReserveNotificationInput = {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  dedupeKey: string;
  inAppVisible: boolean;
  emailStatus: NotificationEmailStatus;
};

@Injectable()
export class NotificationsRepository {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(TaskItem.name) private readonly tasks: Model<TaskItem>,
    @InjectModel(PlatformMeeting.name)
    private readonly platformMeetings: Model<PlatformMeeting>,
    @InjectModel(ManagedCalendarEvent.name)
    private readonly calendarEvents: Model<ManagedCalendarEvent>,
    @InjectModel(OnboardingSetup.name)
    private readonly onboardingSetups: Model<OnboardingSetup>,
  ) {}

  async reserve(input: ReserveNotificationInput) {
    const id = new Types.ObjectId();
    try {
      const record = await this.notifications
        .findOneAndUpdate(
          { dedupeKey: input.dedupeKey },
          { $setOnInsert: { _id: id, ...input } },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
      return { record, created: String(record?._id) === String(id) };
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      const record = await this.notifications
        .findOne({ dedupeKey: input.dedupeKey })
        .lean()
        .exec();
      if (!record) throw error;
      return { record, created: false };
    }
  }

  updateEmailResult(
    id: string,
    status: NotificationEmailStatus,
    failureMessage?: string,
  ) {
    return this.notifications
      .findByIdAndUpdate(
        id,
        {
          $set: {
            emailStatus: status,
            ...(status === NotificationEmailStatus.SENT
              ? { emailSentAt: new Date() }
              : {}),
            ...(failureMessage
              ? { emailFailureMessage: failureMessage.slice(0, 500) }
              : {}),
          },
          ...(status === NotificationEmailStatus.SENT
            ? { $unset: { emailFailureMessage: 1 } }
            : {}),
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async list(
    organizationId: string,
    userId: string,
    query: ListNotificationsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: FilterQuery<Notification> = {
      organizationId,
      userId,
      inAppVisible: true,
      ...(query.type ? { type: query.type } : {}),
    };
    if (query.status === NotificationReadFilter.UNREAD) {
      filter.readAt = { $exists: false };
    } else if (query.status === NotificationReadFilter.READ) {
      filter.readAt = { $exists: true };
    }

    const [items, total, unreadCount] = await Promise.all([
      this.notifications
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.notifications.countDocuments(filter).exec(),
      this.unreadCount(organizationId, userId),
    ]);
    return {
      items,
      total,
      unreadCount,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  unreadCount(organizationId: string, userId: string) {
    return this.notifications
      .countDocuments({
        organizationId,
        userId,
        inAppVisible: true,
        readAt: { $exists: false },
      })
      .exec();
  }

  async markRead(organizationId: string, userId: string, id: string) {
    const updated = await this.notifications
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          userId,
          inAppVisible: true,
          readAt: { $exists: false },
        },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .lean()
      .exec();
    if (updated) return updated;
    return this.notifications
      .findOne({ _id: id, organizationId, userId, inAppVisible: true })
      .lean()
      .exec();
  }

  markUnread(organizationId: string, userId: string, id: string) {
    return this.notifications
      .findOneAndUpdate(
        { _id: id, organizationId, userId, inAppVisible: true },
        { $unset: { readAt: 1 } },
        { new: true },
      )
      .lean()
      .exec();
  }

  markAllRead(organizationId: string, userId: string) {
    return this.notifications
      .updateMany(
        {
          organizationId,
          userId,
          inAppVisible: true,
          readAt: { $exists: false },
        },
        { $set: { readAt: new Date() } },
      )
      .exec();
  }

  findActiveUserById(id: string) {
    return this.users
      .findOne({ _id: id, status: UserStatus.ACTIVE })
      .select('organizationId email firstName lastName timezone role')
      .lean()
      .exec();
  }

  findActiveUsersBatch(afterId: string | undefined, limit: number) {
    const filter: FilterQuery<User> = { status: UserStatus.ACTIVE };
    if (afterId && Types.ObjectId.isValid(afterId)) {
      filter._id = { $gt: new Types.ObjectId(afterId) };
    }
    return this.users
      .find(filter)
      .select('organizationId email firstName lastName timezone role')
      .sort({ _id: 1 })
      .limit(limit)
      .lean()
      .exec();
  }

  findOrganizationTimezones(organizationIds: string[]) {
    const ids = organizationIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    return this.organizations
      .find({ _id: { $in: ids } })
      .select('timezone')
      .lean()
      .exec();
  }

  async findMeetingsStartingBetween(from: Date, to: Date) {
    const [platformMeetings, calendarEvents, onboardingSetups] =
      await Promise.all([
        this.platformMeetings
          .find({
            status: {
              $in: [
                PlatformMeetingStatus.READY,
                PlatformMeetingStatus.SCHEDULED,
              ],
            },
            startsAt: { $gte: from, $lt: to },
          })
          .select('organizationId createdByUserId title startsAt timezone')
          .lean()
          .exec(),
        this.calendarEvents
          .find({
            status: CalendarEventStatus.SCHEDULED,
            startsAt: { $gte: from, $lt: to },
          })
          .select('organizationId createdByUserId title startsAt timezone')
          .lean()
          .exec(),
        this.onboardingSetups
          .find({
            'meeting.status': SetupMeetingStatus.SCHEDULED,
            'meeting.startTime': { $gte: from, $lt: to },
          })
          .select(
            'organizationId organizerId selectedSetupPackage.name meeting.startTime meeting.timezone',
          )
          .lean()
          .exec(),
      ]);

    return [
      ...platformMeetings.map((meeting) => ({
        sourceType: 'PLATFORM_MEETING',
        sourceId: String(meeting._id),
        organizationId: meeting.organizationId,
        userId: meeting.createdByUserId,
        title: meeting.title,
        startsAt: meeting.startsAt,
        timezone: meeting.timezone,
      })),
      ...calendarEvents.map((event) => ({
        sourceType: 'CALENDAR_EVENT',
        sourceId: String(event._id),
        organizationId: event.organizationId,
        userId: event.createdByUserId,
        title: event.title,
        startsAt: event.startsAt,
        timezone: event.timezone,
      })),
      ...onboardingSetups.map((setup) => ({
        sourceType: 'ONBOARDING_MEETING',
        sourceId: String(setup._id),
        organizationId: setup.organizationId,
        userId: setup.organizerId,
        title: setup.selectedSetupPackage?.name || 'Onboarding meeting',
        startsAt: setup.meeting.startTime!,
        timezone: setup.meeting.timezone,
      })),
    ];
  }

  async weeklyRoiActivitySummary(organizationId: string, since: Date) {
    const base = {
      organizationId,
      status: TaskStatus.COMPLETED,
      $or: [
        { completedAt: { $gte: since } },
        {
          completedAt: { $exists: false },
          updatedAt: { $gte: since },
        },
      ],
    };
    const [completedTasks, aiAssistedTasks] = await Promise.all([
      this.tasks.countDocuments(base).exec(),
      this.tasks
        .countDocuments({ ...base, proposedByAgent: { $exists: true } })
        .exec(),
    ]);
    return { completedTasks, aiAssistedTasks };
  }

  private isDuplicateKey(error: unknown) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: number }).code === 11000,
    );
  }
}
