import { ConfigService } from '@nestjs/config';
import { ContactEnquiryStatus } from '../../common/enums/contact-enquiry-status.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactEnquiriesRepository } from './contact-enquiries.repository';
import { ContactEnquiriesService } from './contact-enquiries.service';

jest.mock('../../common/helpers/mailer.helper', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

describe('ContactEnquiriesService', () => {
  const repository = {
    create: jest.fn(),
    findByClientRequestId: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    list: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'mail.supportEmail' ? 'support@noltra.ai' : undefined,
    ),
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'mail.port': 587,
        'mail.secure': false,
        'mail.from': 'Noltra <no-reply@noltra.ai>',
      };
      return values[key];
    }),
  };
  const audits = { create: jest.fn().mockResolvedValue(undefined) };
  let service: ContactEnquiriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContactEnquiriesService(
      repository as unknown as ContactEnquiriesRepository,
      config as unknown as ConfigService,
      audits as unknown as AuditLogsService,
    );
  });

  it('creates an anonymous enquiry without requiring an organization', async () => {
    repository.findByClientRequestId.mockResolvedValue(null);
    repository.create.mockImplementation(async (input) => ({
      _id: '690a00000000000000000001',
      createdAt: new Date('2026-11-05T04:00:00.000Z'),
      ...input,
    }));

    const result = await service.create({
      fullName: 'Jane Customer',
      email: 'jane@example.com',
      company: 'Example Ltd',
      role: 'Founder',
      message: 'I need help choosing the right Noltra service.',
      acceptContactConsent: true,
      clientRequestId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: '690a00000000000000000001',
        status: ContactEnquiryStatus.NEW,
        duplicate: false,
      }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jane@example.com',
        consentAcceptedAt: expect.any(Date),
        revision: 1,
      }),
    );
  });

  it('uses optimistic revision locking for platform-admin updates', async () => {
    repository.update.mockResolvedValue({
      _id: '690a00000000000000000001',
      referenceId: 'CONTACT-20261105-ABC12345',
      fullName: 'Jane Customer',
      email: 'jane@example.com',
      message: 'I need help choosing the right Noltra service.',
      status: ContactEnquiryStatus.IN_PROGRESS,
      revision: 2,
    });

    await service.update(
      '690a00000000000000000001',
      {
        expectedRevision: 1,
        status: ContactEnquiryStatus.IN_PROGRESS,
        internalNote: 'Assigned to platform support.',
      },
      { id: 'admin-1', organizationId: 'platform-org-1' },
    );

    expect(repository.update).toHaveBeenCalledWith(
      '690a00000000000000000001',
      1,
      {
        status: ContactEnquiryStatus.IN_PROGRESS,
        internalNote: 'Assigned to platform support.',
      },
      'admin-1',
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTACT_ENQUIRY_UPDATED' }),
    );
  });
});
