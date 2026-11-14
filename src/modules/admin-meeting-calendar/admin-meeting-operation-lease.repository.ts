import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminMeetingOperationLease } from '../../database/schemas/admin-meeting-operation-lease.schema';

@Injectable()
export class AdminMeetingOperationLeaseRepository {
  constructor(
    @InjectModel(AdminMeetingOperationLease.name)
    private readonly leases: Model<AdminMeetingOperationLease>,
  ) {}

  async acquire(input: {
    key: string;
    operation: string;
    token: string;
    actorUserId: string;
    now: Date;
    expiresAt: Date;
  }) {
    try {
      const lease = await this.leases
        .findOneAndUpdate(
          {
            key: input.key,
            $or: [
              { expiresAt: { $lte: input.now } },
              { expiresAt: { $exists: false } },
            ],
          },
          {
            $set: {
              operation: input.operation,
              token: input.token,
              actorUserId: input.actorUserId,
              expiresAt: input.expiresAt,
            },
            $setOnInsert: { key: input.key },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
      return lease?.token === input.token;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  async release(key: string, token: string): Promise<void> {
    await this.leases.deleteOne({ key, token }).exec();
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
