import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TaskDepartment } from '../../common/enums/task-department.enum';
import { localDateKey } from '../../common/helpers/local-date-range.helper';
import {
  AiActionProposal,
  AiActionType,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';

type DateRange = { start: Date; end: Date };

type LeanMeeting = Record<string, unknown> & {
  _id: unknown;
  startsAt: Date;
  endsAt: Date;
  title: string;
};

export type DashboardMeeting = {
  id: string;
  sourceType: 'PLATFORM_MEETING' | 'CALENDAR_EVENT';
  title: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  timezone: string;
  status: string;
  platform?: string;
  provider?: string;
  meetingType?: string;
  detailsPath: string;
};

export type ProposalSourceSummary = {
  sourceId: string;
  taskCount: number;
  meetingCount: number;
  statuses: string[];
  latestStatus?: string;
  agent?: { id: string; name: string; type: string };
};

@Injectable()
export class OrganizerDashboardRepository {
  constructor(
    @InjectModel(TaskItem.name) private readonly tasks: Model<TaskItem>,
    @InjectModel(PlatformMeeting.name)
    private readonly platformMeetings: Model<PlatformMeeting>,
    @InjectModel(ManagedCalendarEvent.name)
    private readonly calendarEvents: Model<ManagedCalendarEvent>,
    @InjectModel(AiActionProposal.name)
    private readonly proposals: Model<AiActionProposal>,
  ) {}

  async summary(
    organizationId: string,
    series: DateRange,
    timezone: string,
    asOf: Date,
  ) {
    const openTaskStatuses = Object.values(TaskStatus).filter(
      (status) => status !== TaskStatus.COMPLETED,
    );
    const [taskRows, overdue, platformRows, calendarRows] = await Promise.all([
      this.tasks
        .aggregate<{ date: string; value: number }>([
          {
            $match: {
              organizationId,
              dueDate: { $gte: series.start, $lt: series.end },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  date: '$dueDate',
                  format: '%Y-%m-%d',
                  timezone,
                },
              },
              value: { $sum: 1 },
            },
          },
          { $project: { _id: 0, date: '$_id', value: 1 } },
          { $sort: { date: 1 } },
        ])
        .exec(),
      this.tasks
        .countDocuments({
          organizationId,
          status: { $in: openTaskStatuses },
          dueDate: { $lt: asOf },
        })
        .exec(),
      this.platformMeetings
        .find({
          organizationId,
          status: {
            $in: [PlatformMeetingStatus.READY, PlatformMeetingStatus.SCHEDULED],
          },
          startsAt: { $gte: series.start, $lt: series.end },
        })
        .select(
          '_id startsAt calendarProvider calendarEventId providerMeetingId',
        )
        .lean()
        .exec(),
      this.calendarEvents
        .find({
          organizationId,
          status: CalendarEventStatus.SCHEDULED,
          startsAt: { $gte: series.start, $lt: series.end },
        })
        .select('_id startsAt provider providerEventId')
        .lean()
        .exec(),
    ]);

    const meetingsByDate = new Map<string, Set<string>>();
    for (const meeting of platformRows) {
      this.addMeetingToDate(
        meetingsByDate,
        localDateKey(meeting.startsAt, timezone),
        this.platformMeetingKey(meeting),
      );
    }
    for (const event of calendarRows) {
      this.addMeetingToDate(
        meetingsByDate,
        localDateKey(event.startsAt, timezone),
        this.calendarEventKey(event),
      );
    }

    return {
      taskSeries: taskRows,
      overdueTasks: overdue,
      meetingSeries: [...meetingsByDate.entries()]
        .map(([date, ids]) => ({ date, value: ids.size }))
        .sort((left, right) => left.date.localeCompare(right.date)),
    };
  }

  async upcomingMeetings(
    organizationId: string,
    from: Date,
    limit: number,
  ): Promise<DashboardMeeting[]> {
    const sourceLimit = limit * 2;
    const [platformRows, calendarRows] = await Promise.all([
      this.platformMeetings
        .find({
          organizationId,
          status: {
            $in: [PlatformMeetingStatus.READY, PlatformMeetingStatus.SCHEDULED],
          },
          startsAt: { $gte: from },
        })
        .select(
          '_id title startsAt endsAt durationMinutes timezone status platform calendarProvider calendarEventId providerMeetingId',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(sourceLimit)
        .lean()
        .exec(),
      this.calendarEvents
        .find({
          organizationId,
          status: CalendarEventStatus.SCHEDULED,
          startsAt: { $gte: from },
        })
        .select(
          '_id title startsAt endsAt timezone status provider providerEventId meetingType',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(sourceLimit)
        .lean()
        .exec(),
    ]);

    const unique = new Map<string, DashboardMeeting>();
    for (const meeting of platformRows as unknown as LeanMeeting[]) {
      unique.set(this.platformMeetingKey(meeting), {
        id: String(meeting._id),
        sourceType: 'PLATFORM_MEETING',
        title: meeting.title,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        durationMinutes: Number(meeting.durationMinutes),
        timezone: String(meeting.timezone),
        status: String(meeting.status),
        platform: String(meeting.platform),
        detailsPath: `/api/v1/meetings/${String(meeting._id)}`,
      });
    }
    for (const event of calendarRows as unknown as LeanMeeting[]) {
      const key = this.calendarEventKey(event);
      if (unique.has(key)) continue;
      unique.set(key, {
        id: String(event._id),
        sourceType: 'CALENDAR_EVENT',
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        durationMinutes: Math.max(
          0,
          Math.round(
            (new Date(event.endsAt).getTime() -
              new Date(event.startsAt).getTime()) /
              60_000,
          ),
        ),
        timezone: String(event.timezone),
        status: String(event.status),
        provider: String(event.provider),
        meetingType: String(event.meetingType),
        detailsPath: `/api/v1/calendar/events/${String(event._id)}`,
      });
    }
    return [...unique.values()]
      .sort(
        (left, right) =>
          new Date(left.startsAt).getTime() -
          new Date(right.startsAt).getTime(),
      )
      .slice(0, limit);
  }

  async taskOverview(
    organizationId: string,
    asOf: Date,
    currentPeriod: DateRange,
    previousPeriod: DateRange,
    timezone: string,
  ) {
    const [snapshot, current, previous, series, departments] =
      await Promise.all([
        this.taskCounts(organizationId, asOf),
        this.taskCounts(organizationId, asOf, currentPeriod),
        this.taskCounts(organizationId, asOf, previousPeriod),
        this.taskSeries(organizationId, asOf, currentPeriod, timezone),
        this.taskDepartmentBreakdown(organizationId, currentPeriod),
      ]);

    return { snapshot, current, previous, series, departments };
  }

  private async taskCounts(
    organizationId: string,
    asOf: Date,
    period?: DateRange,
  ) {
    const [result] = await this.tasks
      .aggregate<{
        total: number;
        completed: number;
        inProgress: number;
        pending: number;
        overdue: number;
      }>([
        {
          $match: {
            organizationId,
            ...(period
              ? { dueDate: { $gte: period.start, $lt: period.end } }
              : {}),
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', TaskStatus.COMPLETED] }, 1, 0],
              },
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', TaskStatus.COMPLETED] },
                      {
                        $ne: [{ $ifNull: ['$dueDate', null] }, null],
                      },
                      { $lt: ['$dueDate', asOf] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            inProgress: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', TaskStatus.IN_PROGRESS] },
                      {
                        $or: [
                          { $gte: ['$dueDate', asOf] },
                          { $eq: [{ $ifNull: ['$dueDate', null] }, null] },
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            pending: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $in: [
                          '$status',
                          [
                            TaskStatus.DRAFT,
                            TaskStatus.TODO,
                            TaskStatus.WAITING,
                            TaskStatus.BLOCKED,
                          ],
                        ],
                      },
                      {
                        $or: [
                          { $gte: ['$dueDate', asOf] },
                          { $eq: [{ $ifNull: ['$dueDate', null] }, null] },
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $project: { _id: 0 } },
      ])
      .exec();
    return (
      result || {
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        overdue: 0,
      }
    );
  }

  private taskSeries(
    organizationId: string,
    asOf: Date,
    period: DateRange,
    timezone: string,
  ) {
    return this.tasks
      .aggregate<{
        date: string;
        total: number;
        completed: number;
        inProgress: number;
        pending: number;
        overdue: number;
      }>([
        {
          $match: {
            organizationId,
            dueDate: { $gte: period.start, $lt: period.end },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                date: '$dueDate',
                format: '%Y-%m-%d',
                timezone,
              },
            },
            total: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', TaskStatus.COMPLETED] }, 1, 0],
              },
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', TaskStatus.COMPLETED] },
                      { $lt: ['$dueDate', asOf] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            inProgress: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', TaskStatus.IN_PROGRESS] },
                      { $gte: ['$dueDate', asOf] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            pending: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $in: [
                          '$status',
                          [
                            TaskStatus.DRAFT,
                            TaskStatus.TODO,
                            TaskStatus.WAITING,
                            TaskStatus.BLOCKED,
                          ],
                        ],
                      },
                      { $gte: ['$dueDate', asOf] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            total: 1,
            completed: 1,
            inProgress: 1,
            pending: 1,
            overdue: 1,
          },
        },
        { $sort: { date: 1 } },
      ])
      .exec();
  }

  private taskDepartmentBreakdown(organizationId: string, period: DateRange) {
    return this.tasks
      .aggregate<{ department: TaskDepartment | 'UNASSIGNED'; count: number }>([
        {
          $match: {
            organizationId,
            dueDate: { $gte: period.start, $lt: period.end },
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$department', 'UNASSIGNED'] },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, department: '$_id', count: 1 } },
        { $sort: { count: -1, department: 1 } },
      ])
      .exec();
  }

  topPriorities(organizationId: string, asOf: Date, limit: number) {
    return this.tasks
      .aggregate([
        { $match: { organizationId } },
        {
          $addFields: {
            __completedRank: {
              $cond: [{ $eq: ['$status', TaskStatus.COMPLETED] }, 1, 0],
            },
            __overdueRank: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', TaskStatus.COMPLETED] },
                    { $lt: ['$dueDate', asOf] },
                  ],
                },
                1,
                0,
              ],
            },
            __priorityRank: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$priority', TaskPriority.HIGH] },
                    then: 3,
                  },
                  {
                    case: { $eq: ['$priority', TaskPriority.MEDIUM] },
                    then: 2,
                  },
                ],
                default: 1,
              },
            },
          },
        },
        {
          $sort: {
            __completedRank: 1,
            __overdueRank: -1,
            __priorityRank: -1,
            dueDate: 1,
            createdAt: -1,
          },
        },
        { $limit: limit },
        {
          $project: {
            organizationId: 0,
            __v: 0,
            __completedRank: 0,
            __overdueRank: 0,
            __priorityRank: 0,
          },
        },
      ])
      .exec();
  }

  async proposalSummaries(
    organizationId: string,
    sourceIds: string[],
  ): Promise<Map<string, ProposalSourceSummary>> {
    if (!sourceIds.length) return new Map();
    const rows = await this.proposals
      .aggregate<{
        _id: string;
        taskCount: number;
        meetingCount: number;
        statuses: string[];
        latestStatus?: string;
        agent?: { id: string; name: string; type: string };
      }>([
        {
          $match: {
            organizationId,
            'source.id': { $in: sourceIds },
            'source.type': {
              $in: [
                AiProposalSourceType.CALL_AUDIO,
                AiProposalSourceType.CALL_TRANSCRIPT,
              ],
            },
          },
        },
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $group: {
            _id: '$source.id',
            taskCount: {
              $sum: {
                $cond: [
                  { $eq: ['$actionType', AiActionType.CREATE_TASK] },
                  1,
                  0,
                ],
              },
            },
            meetingCount: {
              $sum: {
                $cond: [
                  { $eq: ['$actionType', AiActionType.SCHEDULE_MEETING] },
                  1,
                  0,
                ],
              },
            },
            statuses: { $addToSet: '$status' },
            latestStatus: { $first: '$status' },
            agent: { $first: '$proposedByAgent' },
          },
        },
      ])
      .exec();
    return new Map(
      rows.map((row) => [
        row._id,
        {
          sourceId: row._id,
          taskCount: row.taskCount,
          meetingCount: row.meetingCount,
          statuses: row.statuses,
          latestStatus: row.latestStatus,
          agent: row.agent,
        },
      ]),
    );
  }

  private addMeetingToDate(
    meetings: Map<string, Set<string>>,
    date: string,
    key: string,
  ) {
    const ids = meetings.get(date) || new Set<string>();
    ids.add(key);
    meetings.set(date, ids);
  }

  private platformMeetingKey(meeting: Record<string, unknown>) {
    if (meeting.calendarEventId) {
      return `calendar:${String(meeting.calendarProvider || '')}:${String(
        meeting.calendarEventId,
      )}`;
    }
    return `platform:${String(meeting._id)}`;
  }

  private calendarEventKey(event: Record<string, unknown>) {
    if (event.providerEventId) {
      return `calendar:${String(event.provider || '')}:${String(
        event.providerEventId,
      )}`;
    }
    return `calendar-record:${String(event._id)}`;
  }
}
