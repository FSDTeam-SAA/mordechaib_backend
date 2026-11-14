import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  BusinessMemoryKind,
  BusinessMemorySourceType,
  BusinessMemoryStatus,
} from '../../common/enums/business-memory.enum';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { ContactsService } from '../contacts/contacts.service';
import { BusinessMemoryRepository } from './business-memory.repository';
import { BusinessMemoryService } from './business-memory.service';

describe('BusinessMemoryService', () => {
  const organizationId = '6a7d637faaab59e0624cde06';
  const ownerId = '6a7d637faaab59e0624cde08';
  const kongkon = '6af40fef9ff07abe4d79f244';
  const stranger = '6af40fef9ff07abe4d79f999';
  const agent = { id: 'agent-1', name: 'Laura', type: 'CHIEF_OF_STAFF' };
  const repository = {
    create: jest.fn(),
    insertNew: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    activeForContacts: jest.fn(),
    activeMatching: jest.fn(),
    activeOfKinds: jest.fn(),
  };
  const contacts = { listActiveSummaries: jest.fn() };
  const sourceContext = { requireActiveRequester: jest.fn() };
  let service: BusinessMemoryService;

  const record = (overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    organizationId,
    kind: BusinessMemoryKind.GOAL,
    status: BusinessMemoryStatus.ACTIVE,
    content: 'Reach $1M ARR by Q4.',
    contactIds: [],
    userIds: [],
    source: { type: BusinessMemorySourceType.MANUAL },
    updatedAt: new Date('2026-11-14T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    contacts.listActiveSummaries.mockImplementation(
      async (_org: string, ids: string[]) =>
        ids.filter((id) => id === kongkon).map((id) => ({ id })),
    );
    repository.insertNew.mockImplementation(
      async (_org: string, items: unknown[]) => items.length,
    );
    service = new BusinessMemoryService(
      repository as unknown as BusinessMemoryRepository,
      contacts as unknown as ContactsService,
      sourceContext as unknown as AiSourceContextService,
    );
  });

  describe('ingestFromChat', () => {
    it('stores proposals as PENDING_REVIEW with their provenance', async () => {
      const count = await service.ingestFromChat(
        organizationId,
        [
          {
            kind: BusinessMemoryKind.COMMITMENT,
            content: '  I promised Kongkon the proposal by 2026-11-20. ',
            contactIds: [kongkon, stranger],
            dueOn: '2026-11-20',
          },
        ],
        { messageId: 'message-1', conversationId: 'conversation-1', agent },
      );

      expect(count).toBe(1);
      const [, [stored]] = repository.insertNew.mock.calls[0];
      expect(stored).toEqual(
        expect.objectContaining({
          organizationId,
          kind: BusinessMemoryKind.COMMITMENT,
          status: BusinessMemoryStatus.PENDING_REVIEW,
          content: 'I promised Kongkon the proposal by 2026-11-20.',
          contactIds: [kongkon], // an id outside the organization is dropped
          dueOn: '2026-11-20',
          source: {
            type: BusinessMemorySourceType.USER_MESSAGE,
            messageId: 'message-1',
            conversationId: 'conversation-1',
          },
          proposedByAgent: agent,
        }),
      );
    });

    it('fingerprints facts so the same one is never proposed twice', () => {
      const a = service.fingerprint(
        BusinessMemoryKind.GOAL,
        'Reach $1M ARR by Q4.',
      );
      const b = service.fingerprint(
        BusinessMemoryKind.GOAL,
        '  reach  $1m ARR by q4 ',
      );
      const c = service.fingerprint(
        BusinessMemoryKind.DECISION,
        'Reach $1M ARR by Q4.',
      );
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    });

    it('caps a turn at five proposals and never throws', async () => {
      const many = Array.from({ length: 8 }, (_, i) => ({
        kind: BusinessMemoryKind.DECISION,
        content: `Decision ${i}`,
      }));
      await service.ingestFromChat(organizationId, many, {
        messageId: 'm',
        conversationId: 'c',
      });
      expect(repository.insertNew.mock.calls[0][1]).toHaveLength(5);

      repository.insertNew.mockRejectedValue(new Error('database down'));
      await expect(
        service.ingestFromChat(organizationId, many, {
          messageId: 'm',
          conversationId: 'c',
        }),
      ).resolves.toBe(0);
    });
  });

  describe('owner review', () => {
    it('approves only pending or rejected memories', async () => {
      repository.update.mockResolvedValue(record());
      await service.approve(
        organizationId,
        ownerId,
        String(new Types.ObjectId()),
      );
      const [, , values, from] = repository.update.mock.calls[0];
      expect(values).toEqual(
        expect.objectContaining({
          status: BusinessMemoryStatus.ACTIVE,
          reviewedByUserId: ownerId,
        }),
      );
      expect(from).toEqual([
        BusinessMemoryStatus.PENDING_REVIEW,
        BusinessMemoryStatus.REJECTED,
      ]);
    });

    it('reports a memory that cannot be reviewed', async () => {
      repository.update.mockResolvedValue(null);
      await expect(
        service.reject(organizationId, ownerId, String(new Types.ObjectId())),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.approve(organizationId, ownerId, 'not-an-id'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('makes an owner-written memory active immediately', async () => {
      repository.create.mockImplementation(async (input: object) => ({
        _id: new Types.ObjectId(),
        ...input,
      }));
      const created = await service.create(organizationId, ownerId, {
        kind: BusinessMemoryKind.FINANCIAL_TARGET,
        content: 'Keep gross margin above 40%.',
      });
      expect(created.status).toBe(BusinessMemoryStatus.ACTIVE);
      await expect(
        service.create(organizationId, ownerId, {
          kind: BusinessMemoryKind.CUSTOMER,
          content: 'x',
          contactIds: [stranger],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recall', () => {
    it('returns only the scoped ACTIVE memories: customers, matches, then goals', async () => {
      const linked = record({
        kind: BusinessMemoryKind.PREFERENCE,
        contactIds: [kongkon],
      });
      const match = record({ kind: BusinessMemoryKind.DECISION });
      const goal = record();
      repository.activeForContacts.mockResolvedValue([linked]);
      repository.activeMatching.mockResolvedValue([match, linked]);
      repository.activeOfKinds.mockResolvedValue([goal]);

      const result = await service.recall(organizationId, {
        requesterUserId: ownerId,
        contactIds: [kongkon],
        search: 'proposal pricing',
        limit: 20,
      });

      expect(sourceContext.requireActiveRequester).toHaveBeenCalledWith(
        organizationId,
        ownerId,
      );
      expect(result.items.map((item) => item.id)).toEqual([
        String(linked._id),
        String(match._id),
        String(goal._id),
      ]);
      expect(repository.activeOfKinds).toHaveBeenCalledWith(
        organizationId,
        [BusinessMemoryKind.GOAL, BusinessMemoryKind.FINANCIAL_TARGET],
        5,
      );
    });

    it('rejects an inactive requester', async () => {
      sourceContext.requireActiveRequester.mockRejectedValue(
        new NotFoundException('Active requester not found'),
      );
      await expect(
        service.recall(organizationId, { requesterUserId: ownerId, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.activeForContacts).not.toHaveBeenCalled();
    });
  });
});
