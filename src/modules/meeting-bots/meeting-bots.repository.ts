import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  ACTIVE_MEETING_BOT_STATUSES,
  MeetingBotStatus,
} from '../../common/enums/meeting-bot-status.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingBot } from '../../database/schemas/meeting-bot.schema';
import { MeetingTranscript } from '../../database/schemas/meeting-transcript.schema';
import { RecallWebhookEvent } from '../../database/schemas/recall-webhook-event.schema';

export type CreateStoredMeetingBot = {
  platform: MeetingPlatform;
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
export class MeetingBotsRepository {
  constructor(
    @InjectModel(MeetingBot.name)
    private readonly meetingModel: Model<MeetingBot>,
    @InjectModel(MeetingTranscript.name)
    private readonly transcriptModel: Model<MeetingTranscript>,
    @InjectModel(RecallWebhookEvent.name)
    private readonly webhookEventModel: Model<RecallWebhookEvent>,
  ) {}

  async createOrFind(input: CreateStoredMeetingBot) {
    const id = new Types.ObjectId();
    try {
      const meeting = await this.meetingModel
        .findOneAndUpdate(
          { deduplicationKey: input.deduplicationKey },
          {
            $setOnInsert: {
              _id: id,
              ...input,
              status: MeetingBotStatus.PENDING,
              audioStorageProvider: 'RECALL',
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
      .select('+meetingUrlEncrypted +audioStorageReference')
      .lean()
      .exec();
  }

  async claimBotCreation(id: string) {
    const claimed = await this.meetingModel
      .findOneAndUpdate(
        { _id: id, status: MeetingBotStatus.PENDING },
        { $set: { status: MeetingBotStatus.CREATING } },
        { new: true, runValidators: true },
      )
      .select('+meetingUrlEncrypted')
      .lean()
      .exec();
    if (claimed) return claimed;
    const existing = await this.findInternalById(id);
    return existing?.status === MeetingBotStatus.CREATING
      ? existing
      : undefined;
  }

  findByIdForOrganization(
    id: string,
    organizationId: string,
    platform?: MeetingPlatform,
  ) {
    return this.meetingModel
      .findOne({ _id: id, organizationId, ...(platform ? { platform } : {}) })
      .lean()
      .exec();
  }

  findByRecallBotId(recallBotId: string) {
    return this.meetingModel.findOne({ recallBotId }).lean().exec();
  }

  findByRecordingId(recordingId: string) {
    return this.meetingModel.findOne({ recordingId }).lean().exec();
  }

  findDuplicate(deduplicationKey: string, activeMeetingKey: string) {
    return this.meetingModel
      .findOne({ $or: [{ deduplicationKey }, { activeMeetingKey }] })
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
    status?: MeetingBotStatus,
    platform?: MeetingPlatform,
  ) {
    const filter: FilterQuery<MeetingBot> = {
      organizationId,
      ...(status ? { status } : {}),
      ...(platform ? { platform } : {}),
    };
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
          { status: { $in: [...ACTIVE_MEETING_BOT_STATUSES] } },
          {
            status: MeetingBotStatus.PENDING,
            $or: [
              { joinAt: { $exists: false } },
              { joinAt: { $lte: new Date(Date.now() + 10 * 60 * 1000) } },
            ],
          },
        ],
      })
      .exec();
  }

  updateById(id: string, input: Partial<MeetingBot>) {
    return this.meetingModel
      .findByIdAndUpdate(id, this.meetingUpdate(input), {
        new: true,
        runValidators: true,
      })
      .lean()
      .exec();
  }

  updateByRecallBotId(recallBotId: string, input: Partial<MeetingBot>) {
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
    status: MeetingBotStatus,
  ) {
    return this.meetingModel
      .findOneAndUpdate(
        { _id: id, status: MeetingBotStatus.CREATING },
        { $set: { recallBotId, status } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  markBotCreationFailedIfPending(
    id: string,
    failureCode: string,
    failureMessage: string,
  ) {
    return this.meetingModel
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [MeetingBotStatus.PENDING, MeetingBotStatus.CREATING],
          },
        },
        {
          $set: {
            status: MeetingBotStatus.FAILED,
            failureCode,
            failureMessage,
          },
          $unset: { activeMeetingKey: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  claimTranscription(recordingId: string, recallBotId?: string) {
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
            status: MeetingBotStatus.PROCESSING,
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
    platform: MeetingPlatform;
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
      if (this.isDuplicateKeyError(error)) {
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

  private meetingUpdate(input: Partial<MeetingBot>) {
    const terminal =
      input.status !== undefined &&
      [
        MeetingBotStatus.COMPLETED,
        MeetingBotStatus.FAILED,
        MeetingBotStatus.CANCELLED,
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
