import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecallZoomConnection } from '../../database/schemas/recall-zoom-connection.schema';

@Injectable()
export class ZoomConnectionsRepository {
  constructor(
    @InjectModel(RecallZoomConnection.name)
    private readonly connectionModel: Model<RecallZoomConnection>,
  ) {}

  getConnected() {
    return this.connectionModel
      .findOne({ key: 'SIGNED_IN_ZOOM_BOT', status: 'CONNECTED' })
      .lean()
      .exec();
  }

  upsert(input: {
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
}
