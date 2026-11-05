import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  MEETING_FOLLOW_UP_DETECTION_THRESHOLD,
  MeetingFollowUpStatus,
} from '../../common/enums/meeting-follow-up-status.enum';
import {
  AiProposalSource,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { CustomerHealthSnapshot } from '../../database/schemas/customer-health-snapshot.schema';
import { MeetingFollowUp } from '../../database/schemas/meeting-follow-up.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { AiSourceAnalysis } from '../../database/schemas/ai-source-analysis.schema';

type NormalizedMeetingAnalysis = {
  overallConfidence?: number;
  customerIntelligence?: {
    healthScore?: number;
    riskLevel?: string;
  };
  patternDetection?: { followUpRequests?: number };
};

const MEETING_SOURCES = new Set<AiProposalSourceType>([
  AiProposalSourceType.GOOGLE_MEET,
  AiProposalSourceType.ZOOM_MEETING,
]);

@Injectable()
export class MeetingAnalysisInsightsService {
  constructor(
    @InjectModel(PlatformMeeting.name)
    private readonly meetings: Model<PlatformMeeting>,
    @InjectModel(MeetingFollowUp.name)
    private readonly followUps: Model<MeetingFollowUp>,
    @InjectModel(CustomerHealthSnapshot.name)
    private readonly healthSnapshots: Model<CustomerHealthSnapshot>,
    @InjectModel(AiSourceAnalysis.name)
    private readonly analyses: Model<AiSourceAnalysis>,
  ) {}

  async backfill(organizationId: string, limit: number) {
    const analyses = await this.analyses
      .find({
        organizationId,
        'source.type': { $in: [...MEETING_SOURCES] },
      })
      .select('source overallConfidence customerIntelligence patternDetection createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean()
      .exec();
    let processed = 0;
    for (const analysis of analyses) {
      await this.persist(
        organizationId,
        analysis.source,
        analysis,
        (analysis as unknown as { createdAt?: Date }).createdAt || new Date(),
      );
      processed += 1;
    }
    return { scanned: analyses.length, processed, limit, idempotent: true };
  }

  async persist(
    organizationId: string,
    source: AiProposalSource,
    analysis: NormalizedMeetingAnalysis,
    capturedAt = new Date(),
  ) {
    if (!MEETING_SOURCES.has(source.type) || !isValidObjectId(source.id)) return;
    const meeting = await this.meetings
      .findOne({ _id: source.id, organizationId })
      .select('contactIds')
      .lean()
      .exec();
    if (!meeting) return;

    await Promise.all([
      this.persistFollowUp(organizationId, source, analysis, capturedAt),
      this.persistCustomerHealth(
        organizationId,
        source,
        meeting.contactIds || [],
        analysis,
        capturedAt,
      ),
    ]);
  }

  private async persistFollowUp(
    organizationId: string,
    source: AiProposalSource,
    analysis: NormalizedMeetingAnalysis,
    capturedAt: Date,
  ) {
    const score = analysis.patternDetection?.followUpRequests;
    if (
      !this.validScore(score, 100) ||
      score < MEETING_FOLLOW_UP_DETECTION_THRESHOLD
    ) {
      return;
    }
    await this.followUps
      .findOneAndUpdate(
        {
          organizationId,
          'source.type': source.type,
          'source.id': source.id,
        },
        {
          $set: {
            detectionScore: score,
            ...(this.validScore(analysis.overallConfidence, 1)
              ? { analysisConfidence: analysis.overallConfidence }
              : {}),
          },
          $setOnInsert: {
            organizationId,
            source,
            status: MeetingFollowUpStatus.PENDING,
            detectedAt: capturedAt,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  private async persistCustomerHealth(
    organizationId: string,
    source: AiProposalSource,
    contactIds: string[],
    analysis: NormalizedMeetingAnalysis,
    capturedAt: Date,
  ) {
    const healthScore = analysis.customerIntelligence?.healthScore;
    const riskLevel = analysis.customerIntelligence?.riskLevel?.trim();
    const uniqueContactIds = [...new Set(contactIds.filter(isValidObjectId))];
    if (!uniqueContactIds.length || !this.validScore(healthScore, 100) || !riskLevel) {
      return;
    }
    await this.healthSnapshots.bulkWrite(
      uniqueContactIds.map((contactId) => ({
        updateOne: {
          filter: {
            organizationId,
            contactId,
            'source.type': source.type,
            'source.id': source.id,
          },
          update: {
            $set: {
              healthScore,
              riskLevel: riskLevel.toUpperCase(),
              capturedAt,
              ...(this.validScore(analysis.overallConfidence, 1)
                ? { analysisConfidence: analysis.overallConfidence }
                : {}),
            },
            $setOnInsert: { organizationId, contactId, source },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  private validScore(value: unknown, maximum: number): value is number {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= maximum
    );
  }
}
