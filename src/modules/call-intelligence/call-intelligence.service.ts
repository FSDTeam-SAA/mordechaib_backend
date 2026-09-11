import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import path from 'path';
import { stat } from 'fs/promises';
import {
  AiProposalSource,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { CallLog } from '../../database/schemas/call-log.schema';
import { CallRecording } from '../../database/schemas/call-recording.schema';
import { MeetingBot } from '../../database/schemas/meeting-bot.schema';
import { MeetingTranscript } from '../../database/schemas/meeting-transcript.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { ZoomMeeting } from '../../database/schemas/zoom-meeting.schema';
import { ZoomMeetingTranscript } from '../../database/schemas/zoom-meeting-transcript.schema';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { SourceAnalysesRepository } from '../source-analyses/source-analyses.repository';
import { GetCallIntelligenceQueryDto } from './dto/get-call-intelligence-query.dto';

type LeanRecord = Record<string, unknown> & { _id: unknown };

@Injectable()
export class CallIntelligenceService {
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
    private readonly sourceAnalyses: SourceAnalysesRepository,
    private readonly aiActions: AiActionsService,
  ) {}

  async getDetails(
    organizationId: string,
    sourceId: string,
    query: GetCallIntelligenceQueryDto,
  ) {
    this.assertSourceId(sourceId);
    const source = { type: query.sourceType, id: sourceId };
    const [media, storedAnalysis, actions] = await Promise.all([
      this.getSourceMedia(organizationId, source, query.includeTranscript),
      this.sourceAnalyses.findBySource(organizationId, source),
      this.aiActions.getActionCenter(organizationId, sourceId, {
        status: query.status,
        sourceType: query.sourceType,
        taskLimit: query.taskLimit,
        meetingLimit: query.meetingLimit,
      }),
    ]);
    const analysis = storedAnalysis
      ? this.publicDocument(storedAnalysis as unknown as LeanRecord)
      : null;
    return {
      source,
      metadata: media.metadata,
      audio: media.audio,
      transcript: media.transcript,
      analysis,
      actions,
      extensions: {
        crm: null,
      },
    };
  }

  async getCallAudio(
    organizationId: string,
    sourceId: string,
    sourceType: AiProposalSourceType,
  ) {
    if (
      ![
        AiProposalSourceType.CALL_AUDIO,
        AiProposalSourceType.CALL_TRANSCRIPT,
      ].includes(sourceType)
    ) {
      throw new BadRequestException(
        'Use the meeting-bots audio endpoint for meeting sources',
      );
    }
    this.assertSourceId(sourceId);
    const recording = await this.callRecordings
      .findOne({ _id: sourceId, organizationId })
      .select('+localFilePath')
      .lean()
      .exec();
    if (!recording?.localFilePath) {
      throw new NotFoundException('Call audio is not available');
    }
    const filePath = path.resolve(recording.localFilePath);
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      throw new NotFoundException('Call audio file is not available');
    }
    if (!fileStat.isFile()) {
      throw new NotFoundException('Call audio file is not available');
    }
    return {
      filePath,
      size: fileStat.size,
      filename: `${recording.recordingSid}${path.extname(filePath) || '.wav'}`,
      contentType: this.audioContentType(filePath),
    };
  }

  createReport(details: Awaited<ReturnType<CallIntelligenceService['getDetails']>>, format: 'html' | 'json') {
    if (format === 'json') {
      return {
        content: Buffer.from(JSON.stringify(details, null, 2), 'utf8'),
        contentType: 'application/json; charset=utf-8',
        extension: 'json',
      };
    }
    const analysis = details.analysis as Record<string, unknown> | null;
    const actions = details.actions as Record<string, unknown>;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Call Intelligence Report</title><style>body{font:14px Arial,sans-serif;color:#172033;max-width:960px;margin:40px auto;line-height:1.5}h1,h2{color:#172554}section{margin:24px 0;padding:18px;border:1px solid #dbe3f0;border-radius:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fc;padding:14px;border-radius:8px}</style></head><body><h1>Call Intelligence Report</h1><p>Source: ${this.escapeHtml(details.source.type)} / ${this.escapeHtml(details.source.id)}</p><section><h2>Summary</h2><p>${this.escapeHtml(String(analysis?.summary || 'Not available'))}</p></section><section><h2>Analysis</h2><pre>${this.escapeHtml(JSON.stringify(analysis || {}, null, 2))}</pre></section><section><h2>Proposed Actions</h2><pre>${this.escapeHtml(JSON.stringify(actions, null, 2))}</pre></section></body></html>`;
    return {
      content: Buffer.from(html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      extension: 'html',
    };
  }

  private async getSourceMedia(
    organizationId: string,
    source: AiProposalSource,
    includeTranscript: boolean,
  ) {
    if (
      source.type === AiProposalSourceType.CALL_AUDIO ||
      source.type === AiProposalSourceType.CALL_TRANSCRIPT
    ) {
      return this.getCallMedia(organizationId, source, includeTranscript);
    }
    return this.getMeetingMedia(organizationId, source, includeTranscript);
  }

  private async getCallMedia(
    organizationId: string,
    source: AiProposalSource,
    includeTranscript: boolean,
  ) {
    const recording = await this.callRecordings
      .findOne({ _id: source.id, organizationId })
      .select(includeTranscript ? '+transcriptText' : '-transcriptText')
      .lean()
      .exec();
    if (!recording) throw new NotFoundException('Call recording not found');
    const call = await this.callLogs
      .findOne({ organizationId, callSid: recording.callSid })
      .lean()
      .exec();
    return {
      metadata: {
        kind: 'CALL',
        direction: call?.direction,
        status: call?.status,
        fromNumber: call?.fromNumber,
        toNumber: call?.toNumber,
        occurredAt: call?.startedAt,
        endedAt: call?.endedAt,
        durationSeconds: call?.durationSeconds ?? recording.recordingDuration,
        recordingStatus: recording.recordingStatus,
        aiStatus: recording.aiStatus,
      },
      audio: {
        available: Boolean(recording.localFilePath),
        downloadPath: `/api/v1/call-intelligence/${source.id}/audio?sourceType=${source.type}`,
      },
      transcript: {
        available:
          recording.aiStatus === 'COMPLETED' &&
          (!includeTranscript || Boolean(recording.transcriptText)),
        included: includeTranscript,
        text: includeTranscript ? recording.transcriptText : undefined,
        segments: [],
      },
    };
  }

  private async getMeetingMedia(
    organizationId: string,
    source: AiProposalSource,
    includeTranscript: boolean,
  ) {
    const platform =
      source.type === AiProposalSourceType.GOOGLE_MEET
        ? 'GOOGLE_MEET'
        : 'ZOOM';
    const meeting = await this.meetingBots
      .findOne({ _id: source.id, organizationId, platform })
      .lean()
      .exec();
    if (meeting) {
      const platformMeetingId =
        meeting.metadata &&
        typeof meeting.metadata.platformMeetingId === 'string'
          ? meeting.metadata.platformMeetingId
          : undefined;
      const [transcript, connectedMeeting] = await Promise.all([
        this.meetingTranscript(
          this.meetingTranscripts,
          organizationId,
          source.id,
          includeTranscript,
        ),
        platformMeetingId
          ? this.platformMeetings
              .findOne({ _id: platformMeetingId, organizationId })
              .lean()
              .exec()
          : Promise.resolve(null),
      ]);
      return this.meetingMediaResponse(
        source,
        meeting,
        transcript,
        false,
        connectedMeeting,
      );
    }
    if (source.type === AiProposalSourceType.ZOOM_MEETING) {
      const legacy = await this.legacyZoomMeetings
        .findOne({ _id: source.id, organizationId })
        .lean()
        .exec();
      if (legacy) {
        const transcript = await this.meetingTranscript(
          this.legacyZoomTranscripts,
          organizationId,
          source.id,
          includeTranscript,
        );
        return this.meetingMediaResponse(
          source,
          legacy,
          transcript,
          true,
          null,
        );
      }
    }
    throw new NotFoundException('Meeting source not found');
  }

  private async meetingTranscript(
    model: Model<MeetingTranscript> | Model<ZoomMeetingTranscript>,
    organizationId: string,
    meetingId: string,
    includeTranscript: boolean,
  ) {
    const transcriptModel = model as unknown as Model<MeetingTranscript>;
    return transcriptModel
      .findOne({ organizationId, meetingId })
      .select(includeTranscript ? '' : '-transcriptText -segments')
      .lean()
      .exec();
  }

  private meetingMediaResponse(
    source: AiProposalSource,
    meeting: Record<string, unknown>,
    transcript: Record<string, unknown> | null,
    legacy: boolean,
    connectedMeeting: Record<string, unknown> | null,
  ) {
    return {
      metadata: {
        kind: 'MEETING',
        platform: meeting.platform || 'ZOOM',
        status: meeting.status,
        title: connectedMeeting?.title,
        agenda: connectedMeeting?.agenda,
        occurredAt:
          meeting.transcriptCompletedAt || meeting.joinAt || meeting.createdAt,
        startsAt: connectedMeeting?.startsAt || meeting.joinAt,
        endsAt: connectedMeeting?.endsAt,
        durationMinutes: connectedMeeting?.durationMinutes,
        timezone: connectedMeeting?.timezone,
        invitees: connectedMeeting?.invitees || [],
        botName: meeting.botName,
        recordingId: meeting.recordingId,
      },
      audio: {
        available: !legacy && Boolean(meeting.recordingId),
        downloadPath: !legacy
          ? `/api/v1/meeting-bots/${source.id}/audio`
          : null,
      },
      transcript: {
        available: Boolean(transcript),
        included: Boolean(transcript?.transcriptText),
        transcriptId: transcript?.transcriptId,
        languageCode: transcript?.languageCode,
        wordCount: transcript?.wordCount,
        text: transcript?.transcriptText,
        segments: transcript?.segments || [],
      },
    };
  }

  private publicDocument(value: LeanRecord) {
    const { _id, __v, ...document } = value;
    void __v;
    return { id: String(_id), ...document };
  }

  private assertSourceId(sourceId: string) {
    if (!isValidObjectId(sourceId)) {
      throw new BadRequestException('sourceId must be a MongoDB ObjectId');
    }
  }

  private audioContentType(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.mp3') return 'audio/mpeg';
    if (extension === '.m4a') return 'audio/mp4';
    if (extension === '.ogg') return 'audio/ogg';
    if (extension === '.webm') return 'audio/webm';
    return 'audio/wav';
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      };
      return entities[character];
    });
  }
}
