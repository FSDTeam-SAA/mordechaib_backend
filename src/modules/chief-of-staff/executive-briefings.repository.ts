import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ExecutiveBriefingStatus,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { ExecutiveBriefing } from '../../database/schemas/executive-briefing.schema';
import { ExecutiveBriefingAiRequest } from './executive-briefing.types';

type ReserveBriefingInput = {
  organizationId: string;
  requesterUserId: string;
  requesterScopeHash: string;
  briefingType: ExecutiveBriefingType;
  inputHash: string;
  input: ExecutiveBriefingAiRequest;
};

@Injectable()
export class ExecutiveBriefingsRepository {
  constructor(
    @InjectModel(ExecutiveBriefing.name)
    private readonly model: Model<ExecutiveBriefing>,
  ) {}

  async reserve(input: ReserveBriefingInput) {
    const id = new Types.ObjectId();
    try {
      const record = await this.model
        .findOneAndUpdate(
          { idempotencyKey: input.input.idempotencyKey },
          {
            $setOnInsert: {
              _id: id,
              organizationId: input.organizationId,
              requesterUserId: input.requesterUserId,
              requesterScopeHash: input.requesterScopeHash,
              schemaVersion: input.input.schemaVersion,
              briefingType: input.briefingType,
              period: {
                start: new Date(input.input.period.start),
                end: new Date(input.input.period.end),
                timezone: input.input.period.timezone,
              },
              jobId: input.input.jobId,
              idempotencyKey: input.input.idempotencyKey,
              inputHash: input.inputHash,
              input: input.input,
              status: ExecutiveBriefingStatus.QUEUED,
              attemptCount: 0,
            },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
      return { record, created: String(record?._id) === String(id) };
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      const record = await this.model
        .findOne({ idempotencyKey: input.input.idempotencyKey })
        .lean()
        .exec();
      if (!record) throw error;
      return { record, created: false };
    }
  }

  findForWorker(organizationId: string, id: string) {
    return this.model
      .findOne({ _id: id, organizationId })
      .select('+input')
      .lean()
      .exec();
  }

  claimForGeneration(organizationId: string, id: string) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: {
            $in: [
              ExecutiveBriefingStatus.QUEUED,
              ExecutiveBriefingStatus.FAILED,
            ],
          },
        },
        {
          $set: {
            status: ExecutiveBriefingStatus.GENERATING,
            generationStartedAt: new Date(),
          },
          $inc: { attemptCount: 1 },
          $unset: {
            failureCode: 1,
            failureMessage: 1,
            failureRetryable: 1,
          },
        },
        { new: true },
      )
      .select('+input')
      .lean()
      .exec();
  }

  requeueFailed(organizationId: string, id: string) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: ExecutiveBriefingStatus.FAILED,
        },
        {
          $set: { status: ExecutiveBriefingStatus.QUEUED },
          $unset: {
            failureCode: 1,
            failureMessage: 1,
            failureRetryable: 1,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  markReady(
    organizationId: string,
    id: string,
    content: Record<string, unknown>,
  ) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: ExecutiveBriefingStatus.GENERATING,
        },
        {
          $set: {
            status: ExecutiveBriefingStatus.READY,
            content,
            sourceRefs: Array.isArray(content.sourceRefs)
              ? content.sourceRefs
              : [],
            confidence:
              typeof content.confidence === 'number'
                ? content.confidence
                : undefined,
            completedAt: new Date(),
          },
          $unset: {
            failureCode: 1,
            failureMessage: 1,
            failureRetryable: 1,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  markFailed(
    organizationId: string,
    id: string,
    failure: { code: string; message: string; retryable: boolean },
  ) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: {
            $in: [
              ExecutiveBriefingStatus.QUEUED,
              ExecutiveBriefingStatus.GENERATING,
            ],
          },
        },
        {
          $set: {
            status: ExecutiveBriefingStatus.FAILED,
            failureCode: failure.code.slice(0, 100),
            failureMessage: failure.message.slice(0, 2_000),
            failureRetryable: failure.retryable,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  findByIdForRequester(
    organizationId: string,
    requesterUserId: string,
    requesterScopeHash: string,
    id: string,
  ) {
    return this.model
      .findOne({
        _id: id,
        organizationId,
        requesterUserId,
        requesterScopeHash,
      })
      .lean()
      .exec();
  }

  findLatestForPeriod(
    organizationId: string,
    requesterUserId: string,
    requesterScopeHash: string,
    type: ExecutiveBriefingType,
    asOf: Date,
  ) {
    return this.model
      .findOne({
        organizationId,
        requesterUserId,
        requesterScopeHash,
        briefingType: type,
        'period.start': { $lte: asOf },
        'period.end': { $gt: asOf },
      })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .exec();
  }

  private isDuplicateKey(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
