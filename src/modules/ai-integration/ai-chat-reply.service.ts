import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConversationStatus } from '../../common/enums/conversation-status.enum';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';
import { MessageSenderType } from '../../common/enums/message-sender-type.enum';
import { MessageType } from '../../common/enums/message-type.enum';
import { Conversation } from '../../database/schemas/conversation.schema';
import { Message } from '../../database/schemas/message.schema';
import { AiAssistantMessage } from '../ai-actions/dto/ai-analysis-result.dto';
import { EmailDraftsService } from '../email/email-drafts.service';

type PersistAssistantReplyInput = {
  organizationId: string;
  conversationId: string;
  sourceMessageId: string;
  assistantMessage: AiAssistantMessage;
};

@Injectable()
export class AiChatReplyService {
  constructor(
    @InjectModel(Message.name)
    private readonly messages: Model<Message>,
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    private readonly emailDrafts: EmailDraftsService,
  ) {}

  async persist(input: PersistAssistantReplyInput) {
    const source = await this.messages
      .findOne({
        _id: input.sourceMessageId,
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        senderType: MessageSenderType.USER,
        deletedAt: { $exists: false },
      })
      .lean()
      .exec();
    if (!source) throw new NotFoundException('Source user message not found');

    const conversation = await this.conversations
      .findOne({
        _id: input.conversationId,
        organizationId: input.organizationId,
        status: ConversationStatus.ACTIVE,
      })
      .lean()
      .exec();
    if (!conversation) throw new NotFoundException('Conversation not found');

    const existing = await this.findExisting(input);
    if (existing) {
      this.assertSameLogicalReply(existing, input);
      await this.ensureEmailDraft(existing, input, String(source.senderId));
      return { message: existing, created: false };
    }

    let created: Record<string, unknown>;
    try {
      const document = await this.messages.create({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        sourceMessageId: input.sourceMessageId,
        aiResponseId: input.assistantMessage.responseId,
        senderId: input.assistantMessage.agent.id,
        senderType: MessageSenderType.AI,
        type: MessageType.TEXT,
        content: input.assistantMessage.content,
        attachmentCount: 0,
        processingStatus: MessageProcessingStatus.COMPLETED,
        agentId: input.assistantMessage.agent.id,
        agentName: input.assistantMessage.agent.name,
        agentType: input.assistantMessage.agent.type,
        agentImageUrl: input.assistantMessage.agent.imageUrl,
        agentRunId: input.assistantMessage.runId,
        processedAt: new Date(),
      });
      created = document.toObject() as unknown as Record<string, unknown>;
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      const raced = await this.findExisting(input);
      if (!raced) throw error;
      this.assertSameLogicalReply(raced, input);
      await this.ensureEmailDraft(raced, input, String(source.senderId));
      return { message: raced, created: false };
    }

    const recorded = await this.conversations
      .findOneAndUpdate(
        {
          _id: input.conversationId,
          organizationId: input.organizationId,
          status: ConversationStatus.ACTIVE,
        },
        {
          $inc: { totalMessageCount: 1 },
          $set: {
            lastMessageAt:
              created.createdAt instanceof Date
                ? created.createdAt
                : new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!recorded) {
      throw new ConflictException(
        'AI reply was saved but the conversation could not be updated',
      );
    }
    await this.ensureEmailDraft(created, input, String(source.senderId));
    return { message: created, created: true };
  }

  private async ensureEmailDraft(
    message: Record<string, unknown>,
    input: PersistAssistantReplyInput,
    userId: string,
  ) {
    const draft = input.assistantMessage.emailDraft;
    if (!draft) return;
    const saved = await this.emailDrafts.ensureFromAiReply({
      organizationId: input.organizationId,
      userId,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      aiResponseId: input.assistantMessage.responseId,
      draft,
    });
    if (!saved) return;
    if (message.emailDraftId === saved.id) return;
    await this.messages
      .updateOne(
        { _id: message._id, organizationId: input.organizationId },
        { $set: { emailDraftId: saved.id } },
      )
      .exec();
    message.emailDraftId = saved.id;
  }

  private findExisting(input: PersistAssistantReplyInput) {
    return this.messages
      .findOne({
        organizationId: input.organizationId,
        aiResponseId: input.assistantMessage.responseId,
      })
      .lean()
      .exec() as Promise<Record<string, unknown> | null>;
  }

  private assertSameLogicalReply(
    existing: Record<string, unknown>,
    input: PersistAssistantReplyInput,
  ) {
    const expected = input.assistantMessage;
    const same =
      String(existing.conversationId) === input.conversationId &&
      String(existing.sourceMessageId) === input.sourceMessageId &&
      existing.content === expected.content &&
      existing.agentId === expected.agent.id &&
      existing.agentName === expected.agent.name &&
      (existing.agentType === undefined ||
        existing.agentType === expected.agent.type) &&
      (existing.agentRunId || undefined) === (expected.runId || undefined);
    if (!same) {
      throw new BadRequestException(
        'AI responseId was reused with different assistant message content',
      );
    }
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
