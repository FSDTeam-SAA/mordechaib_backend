import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConversationStatus } from '../../common/enums/conversation-status.enum';
import { Conversation } from '../../database/schemas/conversation.schema';

type ConversationListFilters = {
  status?: ConversationStatus;
};

@Injectable()
export class ConversationsRepository {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
  ) {}

  findLatest(organizationId: string, createdBy: string) {
    return this.conversationModel
      .findOne({ organizationId, createdBy })
      .sort({ lastMessageAt: -1, createdAt: -1, _id: -1 })
      .lean()
      .exec();
  }

  findById(organizationId: string, conversationId: string, createdBy?: string) {
    return this.conversationModel
      .findOne({
        _id: conversationId,
        organizationId,
        ...(createdBy ? { createdBy } : {}),
      })
      .lean()
      .exec();
  }

  async create(organizationId: string, createdBy: string, title: string) {
    const conversation = await this.conversationModel.create({
      organizationId,
      createdBy,
      title,
      isDefault: false,
      status: ConversationStatus.ACTIVE,
      totalMessageCount: 0,
    });
    return conversation.toObject();
  }

  async list(
    organizationId: string,
    createdBy: string,
    page: number,
    limit: number,
    filters: ConversationListFilters,
  ) {
    const filter = {
      organizationId,
      createdBy,
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.conversationModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async findOrCreate(organizationId: string, createdBy: string) {
    const current = await this.findLatest(organizationId, createdBy);
    if (current) return current;
    try {
      return await this.conversationModel
        .findOneAndUpdate(
          { organizationId, createdBy, isDefault: true },
          {
            $setOnInsert: {
              organizationId,
              createdBy,
              title: 'AI Assistant',
              isDefault: true,
              status: ConversationStatus.ACTIVE,
              totalMessageCount: 0,
            },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        const existing = await this.findLatest(organizationId, createdBy);
        if (existing) return existing;
      }
      throw error;
    }
  }

  recordMessage(organizationId: string, conversationId: string, sentAt: Date) {
    return this.conversationModel
      .findOneAndUpdate(
        { _id: conversationId, organizationId },
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
