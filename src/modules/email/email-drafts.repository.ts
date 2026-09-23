import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EmailDraftStatus,
  EmailProvider,
} from '../../common/enums/email-provider.enum';
import { EmailDraft } from '../../database/schemas/email-draft.schema';

export type EmailDraftValues = {
  provider?: EmailProvider;
  to: string[];
  subject: string;
  body: string;
};

@Injectable()
export class EmailDraftsRepository {
  constructor(
    @InjectModel(EmailDraft.name) private readonly drafts: Model<EmailDraft>,
  ) {}

  createManual(
    organizationId: string,
    userId: string,
    values: EmailDraftValues & { clientDraftId?: string },
  ) {
    return this.drafts.create({
      organizationId,
      userId,
      status: EmailDraftStatus.DRAFT,
      revision: 1,
      sendAttemptCount: 0,
      ...values,
    });
  }

  findByClientId(
    organizationId: string,
    userId: string,
    clientDraftId: string,
  ) {
    return this.drafts
      .findOne({ organizationId, userId, clientDraftId })
      .lean()
      .exec();
  }

  async ensureAiDraft(input: {
    organizationId: string;
    userId: string;
    sourceMessageId: string;
    sourceConversationId: string;
    sourceAiResponseId: string;
    values: EmailDraftValues;
  }) {
    const filter = {
      organizationId: input.organizationId,
      sourceAiResponseId: input.sourceAiResponseId,
    };
    try {
      return await this.drafts
        .findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...filter,
              userId: input.userId,
              sourceMessageId: input.sourceMessageId,
              sourceConversationId: input.sourceConversationId,
              status: EmailDraftStatus.DRAFT,
              revision: 1,
              sendAttemptCount: 0,
              ...input.values,
            },
          },
          { upsert: true, new: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      return this.drafts.findOne(filter).lean().exec();
    }
  }

  find(organizationId: string, userId: string, id: string) {
    return this.drafts
      .findOne({ _id: id, organizationId, userId })
      .lean()
      .exec();
  }

  async list(
    organizationId: string,
    userId: string,
    page: number,
    limit: number,
  ) {
    const filter = { organizationId, userId };
    const [items, total] = await Promise.all([
      this.drafts
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.drafts.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  update(
    organizationId: string,
    userId: string,
    id: string,
    values: Partial<EmailDraftValues>,
  ) {
    return this.drafts
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          userId,
          status: { $in: [EmailDraftStatus.DRAFT, EmailDraftStatus.FAILED] },
        },
        {
          $set: { ...values, status: EmailDraftStatus.DRAFT },
          $inc: { revision: 1 },
          $unset: { lastError: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  claimSend(
    organizationId: string,
    userId: string,
    id: string,
    provider: EmailProvider,
    sendAttemptId: string,
    expectedRevision: number,
  ) {
    return this.drafts
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          userId,
          revision: expectedRevision,
          status: { $in: [EmailDraftStatus.DRAFT, EmailDraftStatus.FAILED] },
        },
        {
          $set: {
            status: EmailDraftStatus.SENDING,
            provider,
            sendAttemptId,
          },
          $inc: { sendAttemptCount: 1 },
          $unset: { lastError: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  markSent(
    organizationId: string,
    id: string,
    sendAttemptId: string,
    from: string,
    providerMessageId?: string,
  ) {
    return this.drafts
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: EmailDraftStatus.SENDING,
          sendAttemptId,
        },
        {
          $set: {
            status: EmailDraftStatus.SENT,
            sentAt: new Date(),
            sentFrom: from,
            ...(providerMessageId ? { providerMessageId } : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  markFailure(
    organizationId: string,
    id: string,
    sendAttemptId: string,
    status: EmailDraftStatus.FAILED | EmailDraftStatus.UNKNOWN,
    message: string,
  ) {
    return this.drafts
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: EmailDraftStatus.SENDING,
          sendAttemptId,
        },
        { $set: { status, lastError: message.slice(0, 500) } },
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
