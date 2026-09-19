import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { MeetingBotStatus } from '../../common/enums/meeting-bot-status.enum';
import { ZoomMeetingStatus } from '../../common/enums/zoom-meeting-status.enum';
import {
  AiActionProposal,
  AiActionProposalStatus,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { AiSourceAnalysis } from '../../database/schemas/ai-source-analysis.schema';
import { CallLog } from '../../database/schemas/call-log.schema';
import { CallRecording } from '../../database/schemas/call-recording.schema';
import { MeetingBot } from '../../database/schemas/meeting-bot.schema';
import { MeetingTranscript } from '../../database/schemas/meeting-transcript.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { ZoomMeeting } from '../../database/schemas/zoom-meeting.schema';
import { ZoomMeetingTranscript } from '../../database/schemas/zoom-meeting-transcript.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RecordingStorageService } from '../twilio/providers/recording-storage.service';

type LeanSource = Record<string, unknown> & { _id: unknown };

const DELETABLE_MEETING_STATUSES = new Set<string>([
  MeetingBotStatus.COMPLETED,
  MeetingBotStatus.FAILED,
  MeetingBotStatus.CANCELLED,
  ZoomMeetingStatus.COMPLETED,
  ZoomMeetingStatus.FAILED,
  ZoomMeetingStatus.CANCELLED,
]);

const BUSY_PROPOSAL_STATUSES = [
  AiActionProposalStatus.ANALYZING,
  AiActionProposalStatus.APPROVED,
  AiActionProposalStatus.EXECUTING,
];

@Injectable()
export class CallIntelligenceDeletionService {
  constructor(
    @InjectModel(MeetingBot.name)
    private readonly meetingBots: Model<MeetingBot>,
    @InjectModel(MeetingTranscript.name)
    private readonly meetingTranscripts: Model<MeetingTranscript>,
    @InjectModel(ZoomMeeting.name)
    private readonly legacyZoomMeetings: Model<ZoomMeeting>,
    @InjectModel(ZoomMeetingTranscript.name)
    private readonly legacyZoomTranscripts: Model<ZoomMeetingTranscript>,
    @InjectModel(CallRecording.name)
    private readonly callRecordings: Model<CallRecording>,
    @InjectModel(CallLog.name)
    private readonly callLogs: Model<CallLog>,
    @InjectModel(PlatformMeeting.name)
    private readonly platformMeetings: Model<PlatformMeeting>,
    @InjectModel(TaskItem.name)
    private readonly tasks: Model<TaskItem>,
    @InjectModel(AiActionProposal.name)
    private readonly proposals: Model<AiActionProposal>,
    @InjectModel(AiSourceAnalysis.name)
    private readonly analyses: Model<AiSourceAnalysis>,
    private readonly recordingStorage: RecordingStorageService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async delete(
    organizationId: string,
    actorUserId: string,
    sourceId: string,
    sourceType: AiProposalSourceType,
  ) {
    this.assertSourceId(sourceId);
    const result = this.isCallSource(sourceType)
      ? await this.deleteCall(organizationId, sourceId)
      : await this.deleteMeeting(organizationId, sourceId, sourceType);

    await this.auditLogs
      .create({
        organizationId,
        userId: actorUserId,
        action: 'CALL_INTELLIGENCE_SOURCE_DELETED',
        resourceType: sourceType,
        resourceId: sourceId,
        metadata: result.deleted,
      })
      .catch(() => undefined);

    return {
      source: { type: sourceType, id: sourceId },
      deleted: true,
      deletedResources: result.deleted,
      retainedBusinessResources: result.retainedBusinessResources,
    };
  }

  private async deleteCall(organizationId: string, sourceId: string) {
    const recording = await this.callRecordings
      .findOne({ _id: sourceId, organizationId })
      .select('+localFilePath')
      .lean()
      .exec();
    if (!recording) throw new NotFoundException('Call recording not found');
    if (!['COMPLETED', 'FAILED'].includes(recording.aiStatus)) {
      throw new ConflictException(
        'The call cannot be deleted while transcription or AI processing is pending',
      );
    }

    const sourceTypes = [
      AiProposalSourceType.CALL_AUDIO,
      AiProposalSourceType.CALL_TRANSCRIPT,
    ];
    await this.assertNoBusyProposals(organizationId, sourceId, sourceTypes);
    if (recording.localFilePath) {
      await this.recordingStorage.deleteRecording(recording.localFilePath);
    }

    const related = await this.deleteIntelligenceArtifacts(
      organizationId,
      sourceId,
      sourceTypes,
    );
    const recordingDelete = await this.callRecordings
      .deleteOne({ _id: sourceId, organizationId })
      .exec();
    const remainingRecordings = await this.callRecordings
      .countDocuments({ organizationId, callSid: recording.callSid })
      .exec();
    const callLogDelete = remainingRecordings
      ? { deletedCount: 0 }
      : await this.callLogs
          .deleteOne({ organizationId, callSid: recording.callSid })
          .exec();

    return {
      deleted: {
        sourceRecords: recordingDelete.deletedCount,
        callLogs: callLogDelete.deletedCount,
        transcripts: 0,
        ...related.deleted,
      },
      retainedBusinessResources: related.retainedBusinessResources,
    };
  }

  private async deleteMeeting(
    organizationId: string,
    sourceId: string,
    sourceType: AiProposalSourceType,
  ) {
    const platform =
      sourceType === AiProposalSourceType.GOOGLE_MEET ? 'GOOGLE_MEET' : 'ZOOM';
    const [meeting, legacyMeeting] = await Promise.all([
      this.meetingBots
        .findOne({ _id: sourceId, organizationId, platform })
        .lean()
        .exec(),
      sourceType === AiProposalSourceType.ZOOM_MEETING
        ? this.legacyZoomMeetings
            .findOne({ _id: sourceId, organizationId })
            .lean()
            .exec()
        : Promise.resolve(null),
    ]);
    if (!meeting && !legacyMeeting) {
      throw new NotFoundException('Meeting source not found');
    }
    if (meeting) {
      this.assertMeetingCanBeDeleted(meeting as unknown as LeanSource);
    }
    if (legacyMeeting) {
      this.assertMeetingCanBeDeleted(legacyMeeting as unknown as LeanSource);
    }
    await this.assertNoBusyProposals(organizationId, sourceId, [sourceType]);

    const related = await this.deleteIntelligenceArtifacts(
      organizationId,
      sourceId,
      [sourceType],
    );
    const [
      transcriptDelete,
      legacyTranscriptDelete,
      meetingDelete,
      legacyDelete,
    ] = await Promise.all([
      this.meetingTranscripts
        .deleteMany({ organizationId, meetingId: sourceId })
        .exec(),
      this.legacyZoomTranscripts
        .deleteMany({ organizationId, meetingId: sourceId })
        .exec(),
      this.meetingBots.deleteOne({ _id: sourceId, organizationId }).exec(),
      sourceType === AiProposalSourceType.ZOOM_MEETING
        ? this.legacyZoomMeetings
            .deleteOne({ _id: sourceId, organizationId })
            .exec()
        : Promise.resolve({ deletedCount: 0 }),
      this.platformMeetings
        .updateMany(
          { organizationId, meetingBotId: sourceId },
          { $unset: { meetingBotId: 1 } },
        )
        .exec(),
    ]);

    return {
      deleted: {
        sourceRecords: meetingDelete.deletedCount + legacyDelete.deletedCount,
        callLogs: 0,
        transcripts:
          transcriptDelete.deletedCount + legacyTranscriptDelete.deletedCount,
        ...related.deleted,
      },
      retainedBusinessResources: related.retainedBusinessResources,
    };
  }

  private async deleteIntelligenceArtifacts(
    organizationId: string,
    sourceId: string,
    sourceTypes: AiProposalSourceType[],
  ) {
    const sourceQuery = {
      organizationId,
      'source.id': sourceId,
      'source.type': { $in: sourceTypes },
    };
    const proposalDocuments = await this.proposals
      .find(sourceQuery)
      .select('_id')
      .lean()
      .exec();
    const proposalIds = proposalDocuments.map((proposal) => proposal._id);
    let retainedTasks = 0;
    let retainedMeetings = 0;

    if (proposalIds.length) {
      const [taskResult, meetingResult] = await Promise.all([
        this.tasks
          .updateMany(
            { organizationId, aiActionProposalId: { $in: proposalIds } },
            { $unset: { aiActionProposalId: 1 } },
          )
          .exec(),
        this.platformMeetings
          .updateMany(
            { organizationId, aiActionProposalId: { $in: proposalIds } },
            { $unset: { aiActionProposalId: 1 } },
          )
          .exec(),
      ]);
      retainedTasks = taskResult.modifiedCount;
      retainedMeetings = meetingResult.modifiedCount;
    }

    const [proposalDelete, analysisDelete] = await Promise.all([
      this.proposals.deleteMany(sourceQuery).exec(),
      this.analyses.deleteMany(sourceQuery).exec(),
    ]);
    return {
      deleted: {
        proposals: proposalDelete.deletedCount,
        analyses: analysisDelete.deletedCount,
      },
      retainedBusinessResources: {
        tasks: retainedTasks,
        meetings: retainedMeetings,
      },
    };
  }

  private async assertNoBusyProposals(
    organizationId: string,
    sourceId: string,
    sourceTypes: AiProposalSourceType[],
  ) {
    const busyProposal = await this.proposals
      .exists({
        organizationId,
        'source.id': sourceId,
        'source.type': { $in: sourceTypes },
        status: { $in: BUSY_PROPOSAL_STATUSES },
      })
      .exec();
    if (busyProposal) {
      throw new ConflictException(
        'The source cannot be deleted while an AI proposal is being refined or executed',
      );
    }
  }

  private assertMeetingCanBeDeleted(meeting: LeanSource) {
    if (
      typeof meeting.status !== 'string' ||
      !DELETABLE_MEETING_STATUSES.has(meeting.status)
    ) {
      throw new ConflictException(
        'The meeting cannot be deleted while its bot is active or processing',
      );
    }
  }

  private isCallSource(sourceType: AiProposalSourceType) {
    return [
      AiProposalSourceType.CALL_AUDIO,
      AiProposalSourceType.CALL_TRANSCRIPT,
    ].includes(sourceType);
  }

  private assertSourceId(sourceId: string) {
    if (!isValidObjectId(sourceId)) {
      throw new BadRequestException('sourceId must be a MongoDB ObjectId');
    }
  }
}
