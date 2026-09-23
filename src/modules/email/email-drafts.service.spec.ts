import { ConflictException } from '@nestjs/common';
import { Model } from 'mongoose';
import {
  EmailDraftStatus,
  EmailProvider,
} from '../../common/enums/email-provider.enum';
import { User } from '../../database/schemas/user.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailConnectionsService } from './email-connections.service';
import { EmailDraftsRepository } from './email-drafts.repository';
import { EmailDraftsService } from './email-drafts.service';
import { EmailProviderClient, EmailSendError } from './email-provider.client';

describe('EmailDraftsService send approval', () => {
  const organizationId = 'org-1';
  const userId = 'owner-1';
  const draftId = '507f1f77bcf86cd799439011';
  const draft = {
    _id: draftId,
    organizationId,
    userId,
    revision: 2,
    status: EmailDraftStatus.DRAFT,
    to: ['client@example.com'],
    subject: 'Project quotation',
    body: 'Please review the quotation.',
  };
  let repository: Record<string, jest.Mock>;
  let connections: { accessToken: jest.Mock };
  let provider: { send: jest.Mock };
  let audits: { create: jest.Mock };
  let service: EmailDraftsService;

  beforeEach(() => {
    repository = {
      find: jest.fn().mockResolvedValue(draft),
      claimSend: jest
        .fn()
        .mockResolvedValue({ ...draft, status: EmailDraftStatus.SENDING }),
      markSent: jest
        .fn()
        .mockResolvedValue({ ...draft, status: EmailDraftStatus.SENT }),
      markFailure: jest
        .fn()
        .mockResolvedValue({ ...draft, status: EmailDraftStatus.UNKNOWN }),
    };
    connections = {
      accessToken: jest.fn().mockResolvedValue({
        token: 'access-token',
        email: 'owner@example.com',
      }),
    };
    provider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'gmail-1' }),
    };
    audits = { create: jest.fn().mockResolvedValue({}) };
    service = new EmailDraftsService(
      repository as unknown as EmailDraftsRepository,
      connections as unknown as EmailConnectionsService,
      provider as unknown as EmailProviderClient,
      audits as unknown as AuditLogsService,
      {} as Model<User>,
    );
  });

  it('sends the exact claimed draft once after recording the send request', async () => {
    await expect(
      service.send(organizationId, userId, draftId, 2, EmailProvider.GOOGLE),
    ).resolves.toEqual(
      expect.objectContaining({ status: EmailDraftStatus.SENT }),
    );

    expect(repository.claimSend).toHaveBeenCalledWith(
      organizationId,
      userId,
      draftId,
      EmailProvider.GOOGLE,
      expect.any(String),
      2,
    );
    expect(audits.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: 'EMAIL_SEND_REQUESTED' }),
    );
    expect(provider.send).toHaveBeenCalledWith(
      EmailProvider.GOOGLE,
      'access-token',
      {
        from: 'owner@example.com',
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
      },
    );
  });

  it('rejects a stale review before calling the provider', async () => {
    await expect(
      service.send(organizationId, userId, draftId, 1, EmailProvider.GOOGLE),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('locks uncertain sends instead of retrying them blindly', async () => {
    provider.send.mockRejectedValue(
      new EmailSendError('provider response lost', false),
    );
    await expect(
      service.send(organizationId, userId, draftId, 2, EmailProvider.GOOGLE),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.markFailure).toHaveBeenCalledWith(
      organizationId,
      draftId,
      expect.any(String),
      EmailDraftStatus.UNKNOWN,
      'provider response lost',
    );
  });

  it('never calls the provider when another request already claimed the draft', async () => {
    repository.claimSend.mockResolvedValue(null);
    await expect(
      service.send(organizationId, userId, draftId, 2, EmailProvider.GOOGLE),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(provider.send).not.toHaveBeenCalled();
    expect(audits.create).not.toHaveBeenCalled();
  });

  it('never calls the provider when the required send audit fails', async () => {
    audits.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(
      service.send(organizationId, userId, draftId, 2, EmailProvider.GOOGLE),
    ).rejects.toThrow('Send audit is unavailable');
    expect(provider.send).not.toHaveBeenCalled();
    expect(repository.markFailure).toHaveBeenCalledWith(
      organizationId,
      draftId,
      expect.any(String),
      EmailDraftStatus.FAILED,
      'Send audit could not be recorded',
    );
  });
});
