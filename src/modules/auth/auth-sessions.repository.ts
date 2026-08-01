import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AuthSession,
  AuthSessionDocument,
} from '../../database/schemas/auth-session.schema';
import { SessionMetadata } from '../../common/types/session-metadata.type';

@Injectable()
export class AuthSessionsRepository {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly sessionModel: Model<AuthSession>,
  ) {}

  create(input: {
    userId: string;
    familyId: string;
    refreshTokenHash: string;
    rememberMe: boolean;
    expiresAt: Date;
    metadata: SessionMetadata;
  }): Promise<AuthSessionDocument> {
    return this.sessionModel.create({
      userId: input.userId,
      familyId: input.familyId,
      refreshTokenHash: input.refreshTokenHash,
      rememberMe: input.rememberMe,
      expiresAt: input.expiresAt,
      userAgent: input.metadata.userAgent,
      ipAddress: input.metadata.ipAddress,
    });
  }

  findByRefreshTokenHash(refreshTokenHash: string) {
    return this.sessionModel.findOne({ refreshTokenHash }).exec();
  }

  findActiveById(id: string) {
    return this.sessionModel
      .findOne({
        _id: id,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .lean()
      .exec();
  }

  revoke(id: string, reason: string, replacedBySessionId?: string) {
    return this.sessionModel
      .findOneAndUpdate(
        { _id: id, revokedAt: { $exists: false } },
        { revokedAt: new Date(), revokeReason: reason, replacedBySessionId },
        { new: true },
      )
      .exec();
  }

  revokeAllForUser(userId: string, reason: string) {
    return this.sessionModel
      .updateMany(
        { userId, revokedAt: { $exists: false } },
        { revokedAt: new Date(), revokeReason: reason },
      )
      .exec();
  }

  revokeFamily(familyId: string, reason: string) {
    return this.sessionModel
      .updateMany(
        { familyId, revokedAt: { $exists: false } },
        { revokedAt: new Date(), revokeReason: reason },
      )
      .exec();
  }
}
