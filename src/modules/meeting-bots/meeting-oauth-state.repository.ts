import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingOAuthState } from '../../database/schemas/meeting-oauth-state.schema';

@Injectable()
export class MeetingOAuthStateRepository {
  constructor(
    @InjectModel(MeetingOAuthState.name)
    private readonly stateModel: Model<MeetingOAuthState>,
  ) {}

  create(input: {
    nonceHash: string;
    platform: MeetingPlatform;
    organizationId: string;
    userId: string;
    expiresAt: Date;
  }) {
    return this.stateModel.create(input);
  }

  consume(input: {
    nonceHash: string;
    platform: MeetingPlatform;
    organizationId: string;
    userId: string;
    now: Date;
  }) {
    return this.stateModel
      .findOneAndUpdate(
        {
          nonceHash: input.nonceHash,
          platform: input.platform,
          organizationId: input.organizationId,
          userId: input.userId,
          expiresAt: { $gt: input.now },
          consumedAt: { $exists: false },
        },
        { $set: { consumedAt: input.now } },
        { new: true },
      )
      .lean()
      .exec();
  }
}
