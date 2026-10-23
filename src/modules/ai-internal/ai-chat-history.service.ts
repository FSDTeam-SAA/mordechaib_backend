import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { ConversationStatus } from '../../common/enums/conversation-status.enum';
import { Conversation } from '../../database/schemas/conversation.schema';
import { Message } from '../../database/schemas/message.schema';

@Injectable()
export class AiChatHistoryService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
  ) {}

  async list(
    organizationId: string,
    conversationId: string,
    limit: number,
    cursor?: string,
  ) {
    if (!isValidObjectId(organizationId) || !isValidObjectId(conversationId)) {
      throw new BadRequestException('Invalid organization or conversation id');
    }
    const beforeId = this.decodeCursor(cursor);
    const conversation = await this.conversations
      .findOne({
        _id: conversationId,
        organizationId,
        status: ConversationStatus.ACTIVE,
      })
      .select('_id organizationId status')
      .lean()
      .exec();
    if (!conversation) throw new NotFoundException('Conversation not found');
    const rows = await this.messages
      .find({
        organizationId,
        conversationId,
        deletedAt: { $exists: false },
        ...(beforeId ? { _id: { $lt: beforeId } } : {}),
      })
      .select('+extractedText +transcription')
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const oldest = page.at(-1);
    return {
      conversation: {
        id: String(conversation._id),
        organizationId: String(conversation.organizationId),
        status: conversation.status,
      },
      items: page.reverse().map((message) => ({
        id: String(message._id),
        senderType: message.senderType,
        content: this.content(message),
        createdAt: this.iso(
          (message as unknown as { createdAt?: Date }).createdAt,
        ),
        ...(message.sourceMessageId
          ? { sourceMessageId: message.sourceMessageId }
          : {}),
        ...(message.agentId && message.agentName && message.agentType
          ? {
              agent: {
                id: message.agentId,
                name: message.agentName,
                type: message.agentType,
                ...(message.agentImageUrl
                  ? { imageUrl: message.agentImageUrl }
                  : {}),
              },
            }
          : {}),
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor:
          hasMore && oldest
            ? Buffer.from(String(oldest._id), 'utf8').toString('base64url')
            : null,
      },
    };
  }

  private decodeCursor(cursor?: string) {
    if (!cursor) return undefined;
    try {
      const id = Buffer.from(cursor, 'base64url').toString('utf8');
      if (!isValidObjectId(id)) throw new Error('invalid cursor');
      return id;
    } catch {
      throw new BadRequestException('Invalid message history cursor');
    }
  }

  private content(message: Message) {
    return (
      message.content ||
      message.extractedText ||
      message.transcription ||
      '[Message without readable text]'
    ).slice(0, 20_000);
  }

  private iso(value?: Date) {
    return (value || new Date(0)).toISOString();
  }
}
