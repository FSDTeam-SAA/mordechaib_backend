import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, PipelineStage } from 'mongoose';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingType } from '../../common/enums/meeting-type.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { adminMeetingCapabilities } from './admin-meeting-capabilities';
import { AdminMeetingCalendarQueryDto } from './dto/admin-meeting-calendar-query.dto';

type AggregateResult = {
  summary: Array<{
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    failed: number;
  }>;
  meetingTypes: Array<{ meetingType: MeetingType; count: number }>;
  items: Array<Record<string, unknown>>;
  upcoming: Array<Record<string, unknown>>;
  pagination: Array<{ total: number }>;
};

@Injectable()
export class AdminMeetingCalendarRepository {
  constructor(
    @InjectModel(PlatformMeeting.name)
    private readonly platformMeetings: Model<PlatformMeeting>,
    @InjectModel(ManagedCalendarEvent.name)
    private readonly calendarEvents: Model<ManagedCalendarEvent>,
  ) {}

  async findActionTarget(
    sourceType: AdminMeetingSourceType,
    id: string,
    now: Date,
  ) {
    if (!isValidObjectId(id)) return undefined;
    const row =
      sourceType === AdminMeetingSourceType.PLATFORM_MEETING
        ? await this.platformMeetings
            .findById(id)
            .select('organizationId status startsAt endsAt')
            .lean()
            .exec()
        : await this.calendarEvents
            .findById(id)
            .select('organizationId status startsAt endsAt')
            .lean()
            .exec();
    if (!row) return undefined;

    const rawStatus = row.status;
    const status =
      rawStatus === PlatformMeetingStatus.CANCELLED ||
      rawStatus === CalendarEventStatus.CANCELLED
        ? AdminMeetingStatus.CANCELLED
        : rawStatus === PlatformMeetingStatus.FAILED ||
            rawStatus === CalendarEventStatus.FAILED
          ? AdminMeetingStatus.FAILED
          : rawStatus === PlatformMeetingStatus.COMPLETED ||
              row.endsAt.getTime() <= now.getTime()
            ? AdminMeetingStatus.COMPLETED
            : rawStatus === PlatformMeetingStatus.CREATING ||
                rawStatus === CalendarEventStatus.CREATING
              ? AdminMeetingStatus.PENDING
              : AdminMeetingStatus.CONFIRMED;

    return {
      id: String(row._id),
      sourceType,
      organizationId: row.organizationId,
      rawStatus,
      status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      capabilities: adminMeetingCapabilities({
        sourceType,
        rawStatus,
        status,
        startsAt: row.startsAt,
        now,
      }),
    };
  }

  async dashboard(query: AdminMeetingCalendarQueryDto, now: Date) {
    const overlapMatch = this.overlapMatch(query);
    const statusMatch = query.status ? { status: query.status } : {};
    const skip = (query.page - 1) * query.limit;
    const pipeline: PipelineStage[] = [
      { $match: overlapMatch },
      { $project: this.platformProjection() },
      {
        $unionWith: {
          coll: 'managed_calendar_events',
          pipeline: [
            { $match: overlapMatch },
            { $project: this.calendarProjection() },
          ],
        },
      },
      { $sort: { dedupeKey: 1, sourcePriority: 1 } },
      { $group: { _id: '$dedupeKey', meeting: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$meeting' } },
      { $addFields: { status: this.normalizedStatusExpression(now) } },
      {
        $addFields: {
          organizationObjectId: {
            $convert: {
              input: '$organizationId',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'organizations',
          localField: 'organizationObjectId',
          foreignField: '_id',
          as: 'organizationRow',
        },
      },
      { $unwind: '$organizationRow' },
      {
        $addFields: {
          organization: {
            id: { $toString: '$organizationRow._id' },
            name: '$organizationRow.name',
          },
        },
      },
      ...this.optionalFilters(query),
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $cond: [
                      { $ne: ['$status', AdminMeetingStatus.FAILED] },
                      1,
                      0,
                    ],
                  },
                },
                pending: this.statusCount(AdminMeetingStatus.PENDING),
                confirmed: this.statusCount(AdminMeetingStatus.CONFIRMED),
                completed: this.statusCount(AdminMeetingStatus.COMPLETED),
                cancelled: this.statusCount(AdminMeetingStatus.CANCELLED),
                failed: this.statusCount(AdminMeetingStatus.FAILED),
              },
            },
            { $project: { _id: 0 } },
          ],
          meetingTypes: [
            { $match: { status: { $ne: AdminMeetingStatus.FAILED } } },
            { $group: { _id: '$meetingType', count: { $sum: 1 } } },
            { $project: { _id: 0, meetingType: '$_id', count: 1 } },
            { $sort: { count: -1, meetingType: 1 } },
          ],
          items: [
            { $match: statusMatch },
            { $sort: { startsAt: 1, id: 1 } },
            { $skip: skip },
            { $limit: query.limit },
            { $project: this.publicProjection() },
          ],
          upcoming: [
            {
              $match: {
                status: AdminMeetingStatus.CONFIRMED,
                startsAt: { $gte: now },
              },
            },
            { $sort: { startsAt: 1, id: 1 } },
            { $limit: 10 },
            { $project: this.publicProjection() },
          ],
          pagination: [{ $match: statusMatch }, { $count: 'total' }],
        },
      },
    ];

    const [result] = await this.platformMeetings
      .aggregate<AggregateResult>(pipeline)
      .allowDiskUse(true)
      .exec();

    return {
      summary: result?.summary[0],
      meetingTypes: result?.meetingTypes || [],
      items: result?.items || [],
      upcoming: result?.upcoming || [],
      total: result?.pagination[0]?.total || 0,
    };
  }

  private overlapMatch(query: AdminMeetingCalendarQueryDto) {
    return {
      startsAt: { $lt: query.to },
      endsAt: { $gt: query.from },
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    };
  }

  private platformProjection() {
    return {
      _id: 0,
      id: { $toString: '$_id' },
      sourceType: { $literal: AdminMeetingSourceType.PLATFORM_MEETING },
      organizationId: 1,
      title: 1,
      description: { $ifNull: ['$agenda', null] },
      startsAt: 1,
      endsAt: 1,
      durationMinutes: 1,
      timezone: 1,
      participantEmails: { $ifNull: ['$invitees', []] },
      rawStatus: '$status',
      meetingType: {
        $switch: {
          branches: [
            {
              case: { $eq: ['$platform', MeetingPlatform.ZOOM] },
              then: MeetingType.ZOOM_MEET,
            },
            {
              case: { $eq: ['$platform', MeetingPlatform.GOOGLE_MEET] },
              then: MeetingType.GOOGLE_MEET,
            },
          ],
          default: MeetingType.OTHER,
        },
      },
      calendarProvider: { $ifNull: ['$calendarProvider', null] },
      meetingPlatform: { $ifNull: ['$platform', null] },
      eventUrl: { $ifNull: ['$calendarEventUrl', null] },
      sourcePriority: { $literal: 0 },
      dedupeKey: {
        $cond: [
          { $and: ['$calendarProvider', '$calendarEventId'] },
          {
            $concat: [
              'calendar:',
              '$organizationId',
              ':',
              '$calendarProvider',
              ':',
              '$calendarEventId',
            ],
          },
          { $concat: ['platform:', { $toString: '$_id' }] },
        ],
      },
    };
  }

  private calendarProjection() {
    return {
      _id: 0,
      id: { $toString: '$_id' },
      sourceType: { $literal: AdminMeetingSourceType.CALENDAR_EVENT },
      organizationId: 1,
      title: 1,
      description: { $ifNull: ['$description', null] },
      startsAt: 1,
      endsAt: 1,
      durationMinutes: {
        $max: [
          0,
          {
            $round: [
              { $divide: [{ $subtract: ['$endsAt', '$startsAt'] }, 60_000] },
              0,
            ],
          },
        ],
      },
      timezone: 1,
      participantEmails: { $ifNull: ['$attendees', []] },
      rawStatus: '$status',
      meetingType: { $ifNull: ['$meetingType', MeetingType.OTHER] },
      calendarProvider: { $ifNull: ['$provider', null] },
      meetingPlatform: { $literal: null },
      eventUrl: { $ifNull: ['$providerEventUrl', null] },
      sourcePriority: { $literal: 1 },
      dedupeKey: {
        $cond: [
          '$providerEventId',
          {
            $concat: [
              'calendar:',
              '$organizationId',
              ':',
              '$provider',
              ':',
              '$providerEventId',
            ],
          },
          { $concat: ['event:', { $toString: '$_id' }] },
        ],
      },
    };
  }

  private normalizedStatusExpression(now: Date) {
    return {
      $switch: {
        branches: [
          {
            case: {
              $in: [
                '$rawStatus',
                [
                  PlatformMeetingStatus.CANCELLED,
                  CalendarEventStatus.CANCELLED,
                ],
              ],
            },
            then: AdminMeetingStatus.CANCELLED,
          },
          {
            case: {
              $in: [
                '$rawStatus',
                [PlatformMeetingStatus.FAILED, CalendarEventStatus.FAILED],
              ],
            },
            then: AdminMeetingStatus.FAILED,
          },
          {
            case: { $eq: ['$rawStatus', PlatformMeetingStatus.COMPLETED] },
            then: AdminMeetingStatus.COMPLETED,
          },
          {
            case: {
              $in: [
                '$rawStatus',
                [PlatformMeetingStatus.CREATING, CalendarEventStatus.CREATING],
              ],
            },
            then: AdminMeetingStatus.PENDING,
          },
          {
            case: { $lte: ['$endsAt', now] },
            then: AdminMeetingStatus.COMPLETED,
          },
        ],
        default: AdminMeetingStatus.CONFIRMED,
      },
    };
  }

  private optionalFilters(
    query: AdminMeetingCalendarQueryDto,
  ): PipelineStage[] {
    const stages: PipelineStage[] = [];
    if (query.sourceType) {
      stages.push({ $match: { sourceType: query.sourceType } });
    }
    if (query.meetingType) {
      stages.push({ $match: { meetingType: query.meetingType } });
    }
    if (query.search) {
      const expression = this.escapeRegex(query.search);
      stages.push({
        $match: {
          $or: [
            { title: { $regex: expression, $options: 'i' } },
            { participantEmails: { $regex: expression, $options: 'i' } },
            { 'organization.name': { $regex: expression, $options: 'i' } },
          ],
        },
      });
    }
    return stages;
  }

  private statusCount(status: AdminMeetingStatus) {
    return { $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } };
  }

  private publicProjection() {
    return {
      _id: 0,
      id: 1,
      sourceType: 1,
      organization: 1,
      title: 1,
      description: 1,
      startsAt: 1,
      endsAt: 1,
      durationMinutes: 1,
      timezone: 1,
      participantEmails: 1,
      status: 1,
      rawStatus: 1,
      meetingType: 1,
      calendarProvider: 1,
      meetingPlatform: 1,
      eventUrl: 1,
    };
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
