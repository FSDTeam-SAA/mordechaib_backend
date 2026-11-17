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
      .findOne({
        organizationId,
        createdBy,
        deletedAt: { $exists: false },
      })
      .sort({ lastMessageAt: -1, createdAt: -1, _id: -1 })
      .lean()
      .exec();
  }

  findById(organizationId: string, conversationId: string, createdBy?: string) {
    return this.conversationModel
      .findOne({
        _id: conversationId,
        organizationId,
        deletedAt: { $exists: false },
        ...(createdBy ? { createdBy } : {}),
      })
      .lean()
      .exec();
  }

  async create(
    organizationId: string,
    createdBy: string,
    title: string,
    selectedAgentId?: string,
  ) {
    const conversation = await this.conversationModel.create({
      organizationId,
      createdBy,
      title,
      isDefault: false,
      status: ConversationStatus.ACTIVE,
      totalMessageCount: 0,
      ...(selectedAgentId ? { selectedAgentId } : {}),
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
      deletedAt: { $exists: false },
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

  updateSelectedAgent(
    organizationId: string,
    conversationId: string,
    createdBy: string,
    selectedAgentId: string,
  ) {
    return this.conversationModel
      .findOneAndUpdate(
        {
          _id: conversationId,
          organizationId,
          createdBy,
          status: ConversationStatus.ACTIVE,
          deletedAt: { $exists: false },
        },
        { $set: { selectedAgentId } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  recordMessage(organizationId: string, conversationId: string, sentAt: Date) {
    return this.conversationModel
      .findOneAndUpdate(
        {
          _id: conversationId,
          organizationId,
          deletedAt: { $exists: false },
        },
        { $inc: { totalMessageCount: 1 }, $set: { lastMessageAt: sentAt } },
        { new: true },
      )
      .lean()
      .exec();
  }

  findForDeletion(
    organizationId: string,
    conversationId: string,
    createdBy: string,
  ) {
    return this.conversationModel
      .findOne({ _id: conversationId, organizationId, createdBy })
      .lean()
      .exec();
  }

  softDelete(
    organizationId: string,
    conversationId: string,
    createdBy: string,
    deletedBy: string,
  ) {
    return this.conversationModel
      .findOneAndUpdate(
        {
          _id: conversationId,
          organizationId,
          createdBy,
          deletedAt: { $exists: false },
        },
        {
          $set: {
            status: ConversationStatus.ARCHIVED,
            deletedAt: new Date(),
            deletedBy,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }
}
