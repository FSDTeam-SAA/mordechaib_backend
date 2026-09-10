import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';
import { MessageSenderType } from '../../common/enums/message-sender-type.enum';
import { MessageType } from '../../common/enums/message-type.enum';
import { Message } from '../../database/schemas/message.schema';

type CreateMessageInput = {
  organizationId: string;
  conversationId: string;
  senderId: string;
  clientMessageId?: string;
  content?: string;
  type: MessageType;
  attachmentCount: number;
};

type CreateAiMessageInput = {
  organizationId: string;
  conversationId: string;
  sourceMessageId: string;
  aiResponseId: string;
  agentId: string;
  agentName: string;
  agentRunId?: string;
  content: string;
};

@Injectable()
export class MessagesRepository {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
  ) {}

  async create(input: CreateMessageInput) {
    const message = await this.messageModel.create({
      ...input,
      senderType: MessageSenderType.USER,
      processingStatus: MessageProcessingStatus.PENDING,
    });
    return message.toObject();
  }

  async createAi(input: CreateAiMessageInput) {
    const message = await this.messageModel.create({
      ...input,
      senderId: input.agentId,
      senderType: MessageSenderType.AI,
      type: MessageType.TEXT,
      attachmentCount: 0,
      processingStatus: MessageProcessingStatus.COMPLETED,
      processedAt: new Date(),
    });
    return message.toObject();
  }

  async list(
    organizationId: string,
    conversationId: string,
    page: number,
    limit: number,
  ) {
    const filter = {
      organizationId,
      conversationId,
      deletedAt: { $exists: false },
    };
    const [items, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.messageModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async listForAi(
    organizationId: string,
    conversationId: string,
    limit: number,
  ) {
    return this.messageModel
      .find({
        organizationId,
        conversationId,
        deletedAt: { $exists: false },
      })
      .select('+extractedText +transcription')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  findActiveById(organizationId: string, messageId: string) {
    return this.messageModel
      .findOne({
        _id: messageId,
        organizationId,
        deletedAt: { $exists: false },
      })
      .lean()
      .exec();
  }

  findByClientMessageId(organizationId: string, clientMessageId: string) {
    return this.messageModel
      .findOne({ organizationId, clientMessageId })
      .lean()
      .exec();
  }

  findByAiResponseId(organizationId: string, aiResponseId: string) {
    return this.messageModel
      .findOne({ organizationId, aiResponseId })
      .lean()
      .exec();
  }

  findForAi(organizationId: string, messageId: string) {
    return this.messageModel
      .findOne({
        _id: messageId,
        organizationId,
        deletedAt: { $exists: false },
      })
      .select('+extractedText +transcription')
      .lean()
      .exec();
  }

  markSourceProcessed(organizationId: string, messageId: string) {
    return this.messageModel
      .updateOne(
        { _id: messageId, organizationId },
        {
          $set: {
            processingStatus: MessageProcessingStatus.COMPLETED,
            processedAt: new Date(),
          },
          $unset: { aiError: 1 },
        },
      )
      .exec();
  }

  updateProcessingStatus(
    organizationId: string,
    messageId: string,
    status: MessageProcessingStatus,
    error?: string,
  ) {
    return this.messageModel
      .findOneAndUpdate(
        {
          _id: messageId,
          organizationId,
          senderType: MessageSenderType.USER,
          deletedAt: { $exists: false },
        },
        {
          $set: {
            processingStatus: status,
            ...(status === MessageProcessingStatus.FAILED
              ? { aiError: (error || 'AI processing failed').slice(0, 500) }
              : {}),
          },
          ...(status !== MessageProcessingStatus.FAILED
            ? { $unset: { aiError: 1 } }
            : {}),
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  findForDeletion(organizationId: string, messageId: string) {
    return this.messageModel
      .findOne({ _id: messageId, organizationId })
      .lean()
      .exec();
  }

  softDelete(organizationId: string, messageId: string, deletedBy: string) {
    return this.messageModel
      .findOneAndUpdate(
        {
          _id: messageId,
          organizationId,
          deletedAt: { $exists: false },
        },
        { $set: { deletedAt: new Date(), deletedBy } },
        { new: true },
      )
      .lean()
      .exec();
  }

  async hardDelete(messageId: string): Promise<void> {
    await this.messageModel.deleteOne({ _id: messageId }).exec();
  }
}
