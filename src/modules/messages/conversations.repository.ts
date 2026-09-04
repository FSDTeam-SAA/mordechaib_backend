import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConversationStatus } from '../../common/enums/conversation-status.enum';
import { Conversation } from '../../database/schemas/conversation.schema';

@Injectable()
export class ConversationsRepository {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
  ) {}

  findByOrganization(organizationId: string) {
    return this.conversationModel.findOne({ organizationId }).lean().exec();
  }

  async findOrCreate(organizationId: string, createdBy: string) {
    try {
      return await this.conversationModel
        .findOneAndUpdate(
          { organizationId },
          {
            $setOnInsert: {
              organizationId,
              createdBy,
              title: 'AI Assistant',
              status: ConversationStatus.ACTIVE,
              totalMessageCount: 0,
            },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      // Two first messages may race to create the singleton conversation.
      // The unique organization index chooses the winner; the loser reuses it.
      if (this.isDuplicateKey(error)) {
        const existing = await this.findByOrganization(organizationId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  recordMessage(organizationId: string, sentAt: Date) {
    return this.conversationModel
      .findOneAndUpdate(
        { organizationId },
        { $inc: { totalMessageCount: 1 }, $set: { lastMessageAt: sentAt } },
        { new: true },
      )
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
