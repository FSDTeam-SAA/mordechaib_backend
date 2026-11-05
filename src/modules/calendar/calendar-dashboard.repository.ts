import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MeetingBotStatus } from '../../common/enums/meeting-bot-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { EmailDraftStatus } from '../../common/enums/email-provider.enum';
import { EmailDraftSourceType } from '../../common/enums/email-draft-source-type.enum';
import { MeetingFollowUpStatus } from '../../common/enums/meeting-follow-up-status.enum';
import {
  AiActionProposal,
  AiActionProposalStatus,
  AiActionTargetType,
  AiActionType,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import {
  AiSourceAnalysis,
  TranscriptInsightCategory,
} from '../../database/schemas/ai-source-analysis.schema';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { AuditLog } from '../../database/schemas/audit-log.schema';
import { MeetingBot } from '../../database/schemas/meeting-bot.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { EmailDraft } from '../../database/schemas/email-draft.schema';
import { MeetingFollowUp } from '../../database/schemas/meeting-follow-up.schema';
import { CustomerHealthSnapshot } from '../../database/schemas/customer-health-snapshot.schema';

type DateRange = { start: Date; end: Date };

const CALL_SOURCES = [
  AiProposalSourceType.CALL_AUDIO,
  AiProposalSourceType.CALL_TRANSCRIPT,
];

const MEETING_SOURCES = [
  AiProposalSourceType.GOOGLE_MEET,
  AiProposalSourceType.ZOOM_MEETING,
];

@Injectable()
export class CalendarDashboardRepository {
  constructor(
    @InjectModel(PlatformMeeting.name)
    private readonly platformMeetings: Model<PlatformMeeting>,
    @InjectModel(ManagedCalendarEvent.name)
    private readonly calendarEvents: Model<ManagedCalendarEvent>,
    @InjectModel(MeetingBot.name)
    private readonly meetingBots: Model<MeetingBot>,
    @InjectModel(TaskItem.name) private readonly tasks: Model<TaskItem>,
    @InjectModel(AiActionProposal.name)
    private readonly proposals: Model<AiActionProposal>,
    @InjectModel(AiSourceAnalysis.name)
    private readonly analyses: Model<AiSourceAnalysis>,
    @InjectModel(AuditLog.name)
    private readonly auditLogs: Model<AuditLog>,
    @InjectModel(EmailDraft.name)
    private readonly emailDrafts: Model<EmailDraft>,
    @InjectModel(MeetingFollowUp.name)
    private readonly followUps: Model<MeetingFollowUp>,
    @InjectModel(CustomerHealthSnapshot.name)
    private readonly healthSnapshots: Model<CustomerHealthSnapshot>,
  ) {}

  async meetings(
    organizationId: string,
    provider: CalendarProviderType,
    from: Date,
    to: Date,
  ) {
    const [platformRows, calendarRows] = await Promise.all([
      this.platformMeetings
        .find({
          organizationId,
          startsAt: { $lt: to },
          endsAt: { $gt: from },
        })
        .select(
          '_id title agenda startsAt endsAt durationMinutes timezone invitees status platform calendarProvider calendarEventId calendarEventUrl meetingBotId botRequested +joinUrlEncrypted',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(5001)
        .lean()
        .exec(),
      this.calendarEvents
        .find({
          organizationId,
          provider,
          startsAt: { $lt: to },
          endsAt: { $gt: from },
        })
        .select(
          '_id title description startsAt endsAt timezone attendees location status provider providerEventId providerEventUrl meetingType urgency prioritySource importedFromProvider',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(5001)
        .lean()
        .exec(),
    ]);
    const platform = platformRows.slice(0, 5000);
    const calendar = calendarRows.slice(0, 5000);
    const platformIds = platform.map((meeting) => String(meeting._id));
    const botIds = platform
      .map((meeting) => meeting.meetingBotId)
      .filter((id): id is string => !!id);
    const [completedBots, confidenceRows] = await Promise.all([
      botIds.length
        ? this.meetingBots
          .find({
            organizationId,
            _id: { $in: botIds },
            status: MeetingBotStatus.COMPLETED,
          })
          .select('_id')
          .lean()
          .exec()
        : [],
      platformIds.length
        ? this.analyses
            .find({
              organizationId,
              'source.type': { $in: MEETING_SOURCES },
              'source.id': { $in: platformIds },
              overallConfidence: { $type: 'number' },
            })
            .select('source overallConfidence')
            .lean()
            .exec()
        : [],
    ]);
    return {
      platform,
      calendar,
      truncated: platformRows.length > 5000 || calendarRows.length > 5000,
      completedBotIds: new Set(completedBots.map((bot) => String(bot._id))),
      confidenceByMeetingId: new Map(
        confidenceRows.map((analysis) => [
          analysis.source.id,
          analysis.overallConfidence as number,
        ]),
      ),
    };
  }

  async operationalMetrics(
    organizationId: string,
    from: Date,
    to: Date,
    asOf: Date,
    today: DateRange,
  ) {
    const openStatuses = Object.values(TaskStatus).filter(
      (status) => status !== TaskStatus.COMPLETED,
    );
    const [
      tasksFromCalls,
      upcomingDeadlines,
      aiReminders,
      analyses,
      actionRows,
      crmUpdatesToday,
      meetingCrmRecordsUpdated,
      followUpsPending,
      followUpEmailsSent,
      customerHealthUpdated,
    ] = await Promise.all([
      this.proposals.countDocuments({
        organizationId,
        actionType: AiActionType.CREATE_TASK,
        status: AiActionProposalStatus.EXECUTED,
        'source.type': { $in: CALL_SOURCES },
        targetResourceType: AiActionTargetType.TASK,
        executedAt: { $gte: from, $lt: to },
      }),
      this.tasks.countDocuments({
        organizationId,
        status: { $in: openStatuses },
        dueDate: { $gte: asOf, $lt: to },
      }),
      this.tasks.countDocuments({
        organizationId,
        status: { $in: openStatuses },
        dueDate: { $gte: asOf, $lt: to },
        'reminder.enabled': true,
      }),
      this.analyses
        .find({
          organizationId,
          'source.type': { $in: MEETING_SOURCES },
          createdAt: { $gte: from, $lt: to },
        })
        .select('_id source summary classifiedSegments')
        .lean()
        .exec(),
      this.analyses
        .aggregate<{ count: number }>([
          {
            $match: {
              organizationId,
              'source.type': { $in: MEETING_SOURCES },
              createdAt: { $gte: from, $lt: to },
            },
          },
          { $unwind: '$classifiedSegments' },
          {
            $match: {
              'classifiedSegments.category':
                TranscriptInsightCategory.ACTION_ITEM,
            },
          },
          { $count: 'count' },
        ])
        .exec(),
      this.auditLogs
        .countDocuments({
          organizationId,
          action: { $in: ['CRM_RECORD_UPDATED', 'CRM_DEAL_UPDATED'] },
          createdAt: { $gte: today.start, $lt: today.end },
        })
        .exec(),
      this.proposals
        .countDocuments({
          organizationId,
          actionType: AiActionType.UPDATE_CRM_RECORD,
          status: AiActionProposalStatus.EXECUTED,
          'source.type': { $in: MEETING_SOURCES },
          targetResourceType: AiActionTargetType.CRM_RECORD,
          executedAt: { $gte: from, $lt: to },
        })
        .exec(),
      this.followUps
        .countDocuments({
          organizationId,
          status: MeetingFollowUpStatus.PENDING,
          detectedAt: { $gte: from, $lt: to },
        })
        .exec(),
      this.emailDrafts
        .countDocuments({
          organizationId,
          status: EmailDraftStatus.SENT,
          'source.type': {
            $in: [
              EmailDraftSourceType.PLATFORM_MEETING,
              EmailDraftSourceType.CALENDAR_EVENT,
            ],
          },
          sentAt: { $gte: from, $lt: to },
        })
        .exec(),
      this.healthSnapshots
        .distinct('contactId', {
          organizationId,
          capturedAt: { $gte: from, $lt: to },
        })
        .then((ids) => ids.length),
    ]);

    const meetingProposalIds = await this.proposals
      .find({
        organizationId,
        actionType: AiActionType.CREATE_TASK,
        status: AiActionProposalStatus.EXECUTED,
        'source.type': { $in: MEETING_SOURCES },
        targetResourceType: AiActionTargetType.TASK,
        executedAt: { $gte: from, $lt: to },
      })
      .select('_id')
      .lean()
      .exec();
    const tasksAssigned = meetingProposalIds.length
      ? await this.tasks.countDocuments({
          organizationId,
          aiActionProposalId: {
            $in: meetingProposalIds.map((proposal) => String(proposal._id)),
          },
          assignedToUserId: { $exists: true, $ne: '' },
        })
      : 0;

    return {
      tasksFromCalls,
      upcomingDeadlines,
      aiReminders,
      notesGenerated: analyses.filter((analysis) => !!analysis.summary).length,
      actionItemsCreated: actionRows[0]?.count || 0,
      tasksAssigned,
      crmUpdatesToday,
      meetingCrmRecordsUpdated,
      followUpsPending,
      followUpEmailsSent,
      customerHealthUpdated,
    };
  }
}
