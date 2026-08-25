import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  ACTIVE_ZOOM_MEETING_STATUSES,
  ZoomMeetingStatus,
} from '../../common/enums/zoom-meeting-status.enum';
import { RecallWebhookEvent } from '../../database/schemas/recall-webhook-event.schema';
import { RecallZoomConnection } from '../../database/schemas/recall-zoom-connection.schema';
import { ZoomMeetingTranscript } from '../../database/schemas/zoom-meeting-transcript.schema';
import { ZoomMeeting } from '../../database/schemas/zoom-meeting.schema';

export type CreateStoredZoomMeeting = {
  organizationId: string;
  createdByUserId: string;
  deduplicationKey: string;
  activeMeetingKey: string;
  meetingUrlHash: string;
  meetingUrlEncrypted: string;
  joinAt?: Date;
  botName: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ZoomMeetingsRepository {
  constructor(
    @InjectModel(ZoomMeeting.name)
    private readonly meetingModel: Model<ZoomMeeting>,
    @InjectModel(ZoomMeetingTranscript.name)
    private readonly transcriptModel: Model<ZoomMeetingTranscript>,
    @InjectModel(RecallZoomConnection.name)
    private readonly connectionModel: Model<RecallZoomConnection>,
    @InjectModel(RecallWebhookEvent.name)
    private readonly webhookEventModel: Model<RecallWebhookEvent>,
  ) {}

  async createOrFind(input: CreateStoredZoomMeeting) {
    const id = new Types.ObjectId();
    try {
      const meeting = await this.meetingModel
        .findOneAndUpdate(
          { deduplicationKey: input.deduplicationKey },
          {
            $setOnInsert: {
              _id: id,
              ...input,
              status: ZoomMeetingStatus.PENDING,
            },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
      return { meeting, created: String(meeting?._id) === String(id) };
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const meeting = await this.meetingModel
        .findOne({
          $or: [
            { deduplicationKey: input.deduplicationKey },
            { activeMeetingKey: input.activeMeetingKey },
          ],
        })
        .lean()
        .exec();
      if (!meeting) throw error;
      return { meeting, created: false };
    }
  }

  findInternalById(id: string) {
    return this.meetingModel
      .findById(id)
      .select('+meetingUrlEncrypted')
      .lean()
      .exec();
  }

  async claimBotCreation(id: string) {
    const claimed = await this.meetingModel
      .findOneAndUpdate(
        { _id: id, status: ZoomMeetingStatus.PENDING },
        { $set: { status: ZoomMeetingStatus.CREATING } },
        { new: true, runValidators: true },
      )
      .select('+meetingUrlEncrypted')
      .lean()
      .exec();
    if (claimed) return claimed;

    const existing = await this.findInternalById(id);
    return existing?.status === ZoomMeetingStatus.CREATING
      ? existing
      : undefined;
  }

  findByIdForOrganization(id: string, organizationId: string) {
    return this.meetingModel.findOne({ _id: id, organizationId }).lean().exec();
  }

  findByRecallBotId(recallBotId: string) {
    return this.meetingModel.findOne({ recallBotId }).lean().exec();
  }

  findByRecordingId(recordingId: string) {
    return this.meetingModel.findOne({ recordingId }).lean().exec();
  }

  findDuplicate(deduplicationKey: string, activeMeetingKey: string) {
    return this.meetingModel
      .findOne({
        $or: [{ deduplicationKey }, { activeMeetingKey }],
      })
      .lean()
      .exec();
  }

  findByActiveMeetingKey(activeMeetingKey: string) {
    return this.meetingModel.findOne({ activeMeetingKey }).lean().exec();
  }

  async list(
    organizationId: string,
    page: number,
    limit: number,
    status?: ZoomMeetingStatus,
  ) {
    const filter: FilterQuery<ZoomMeeting> = { organizationId };
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      this.meetingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.meetingModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  countActive(organizationId?: string) {
    return this.meetingModel
      .countDocuments({
        ...(organizationId ? { organizationId } : {}),
        $or: [
          { status: { $in: [...ACTIVE_ZOOM_MEETING_STATUSES] } },
          {
            status: ZoomMeetingStatus.PENDING,
            $or: [
              { joinAt: { $exists: false } },
              { joinAt: { $lte: new Date(Date.now() + 10 * 60 * 1000) } },
            ],
          },
        ],
      })
      .exec();
  }

  updateById(id: string, input: Partial<ZoomMeeting>) {
    return this.meetingModel
      .findByIdAndUpdate(id, this.meetingUpdate(input), {
        new: true,
        runValidators: true,
      })
      .lean()
      .exec();
  }

  updateByRecallBotId(recallBotId: string, input: Partial<ZoomMeeting>) {
    return this.meetingModel
      .findOneAndUpdate({ recallBotId }, this.meetingUpdate(input), {
        new: true,
        runValidators: true,
      })
      .lean()
      .exec();
  }

  attachBotIfPending(
    id: string,
    recallBotId: string,
    status: ZoomMeetingStatus,
  ) {
    return this.meetingModel
      .findOneAndUpdate(
        { _id: id, status: ZoomMeetingStatus.CREATING },
        { $set: { recallBotId, status } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  markBotCreationFailedIfPending(id: string, failureMessage: string) {
    return this.meetingModel
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [ZoomMeetingStatus.PENDING, ZoomMeetingStatus.CREATING],
          },
        },
        {
          $set: {
            status: ZoomMeetingStatus.FAILED,
            failureMessage,
          },
          $unset: { activeMeetingKey: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async claimTranscription(recordingId: string, recallBotId?: string) {
    return this.meetingModel
      .findOneAndUpdate(
        {
          ...(recallBotId ? { recallBotId } : { recordingId }),
          transcriptionRequestedAt: { $exists: false },
        },
        {
          $set: {
            recordingId,
            transcriptionRequestedAt: new Date(),
            status: ZoomMeetingStatus.PROCESSING,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  releaseTranscriptionClaim(meetingId: string) {
    return this.meetingModel
      .findByIdAndUpdate(meetingId, { $unset: { transcriptionRequestedAt: 1 } })
      .exec();
  }

  upsertTranscript(input: {
    meetingId: string;
    organizationId: string;
    recordingId: string;
    transcriptId: string;
    transcriptText: string;
    segments: Record<string, unknown>[];
    wordCount: number;
    provider?: string;
    languageCode?: string;
  }) {
    return this.transcriptModel
      .findOneAndUpdate(
        { meetingId: input.meetingId },
        { $set: input },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  findTranscript(meetingId: string, organizationId: string) {
    return this.transcriptModel
      .findOne({ meetingId, organizationId })
      .lean()
      .exec();
  }

  getConnection() {
    return this.connectionModel
      .findOne({ key: 'SIGNED_IN_ZOOM_BOT', status: 'CONNECTED' })
      .lean()
      .exec();
  }

  upsertConnection(input: {
    recallOAuthAppId: string;
    recallCredentialId: string;
    connectedByUserId: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.connectionModel
      .findOneAndUpdate(
        { key: 'SIGNED_IN_ZOOM_BOT' },
        {
          $set: {
            ...input,
            key: 'SIGNED_IN_ZOOM_BOT',
            status: 'CONNECTED',
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async claimWebhookEvent(eventId: string, eventType: string) {
    const existing = await this.webhookEventModel.findOne({ eventId }).exec();
    if (existing?.status === 'PROCESSED') {
      return { claimed: false, event: existing.toObject() };
    }
    if (existing) {
      existing.status = 'PROCESSING';
      existing.error = undefined;
      await existing.save();
      return { claimed: true, event: existing.toObject() };
    }
    try {
      const event = await this.webhookEventModel.create({
        eventId,
        eventType,
        status: 'PROCESSING',
      });
      return { claimed: true, event: event.toObject() };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 11000
      ) {
        return { claimed: false, event: undefined };
      }
      throw error;
    }
  }

  completeWebhookEvent(eventId: string) {
    return this.webhookEventModel
      .findOneAndUpdate(
        { eventId },
        {
          $set: { status: 'PROCESSED', processedAt: new Date() },
          $unset: { error: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  failWebhookEvent(eventId: string, error: string) {
    return this.webhookEventModel
      .findOneAndUpdate(
        { eventId },
        { $set: { status: 'FAILED', error: error.slice(0, 1000) } },
        { new: true },
      )
      .lean()
      .exec();
  }

  private meetingUpdate(input: Partial<ZoomMeeting>) {
    const terminal =
      input.status !== undefined &&
      [
        ZoomMeetingStatus.COMPLETED,
        ZoomMeetingStatus.FAILED,
        ZoomMeetingStatus.CANCELLED,
      ].includes(input.status);
    return {
      $set: input,
      ...(terminal ? { $unset: { activeMeetingKey: 1 } } : {}),
    };
  }

  private isDuplicateKeyError(error: unknown) {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    );
  }
}
