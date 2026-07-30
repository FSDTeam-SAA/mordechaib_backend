import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthTokenType } from '../../common/enums/auth-token-type.enum';
import { AuthToken } from '../../database/schemas/auth-token.schema';

@Injectable()
export class AuthTokensRepository {
  constructor(
    @InjectModel(AuthToken.name)
    private readonly tokenModel: Model<AuthToken>,
  ) {}

  create(input: {
    userId: string;
    type: AuthTokenType;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.tokenModel.create(input);
  }

  invalidateActive(userId: string, type: AuthTokenType) {
    return this.tokenModel
      .updateMany(
        { userId, type, consumedAt: { $exists: false } },
        { consumedAt: new Date() },
      )
      .exec();
  }

  consume(tokenHash: string, type: AuthTokenType) {
    return this.tokenModel
      .findOneAndUpdate(
        {
          tokenHash,
          type,
          consumedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        { consumedAt: new Date() },
        { new: true },
      )
      .exec();
  }
}
