import { Model } from 'mongoose';
import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import {
  SupportRequestPriority,
  SupportRequestStatus,
} from '../../common/enums/support-request.enum';
import { SupportRequest } from '../../database/schemas/support-request.schema';
import { SupportBriefingFactsService } from './support-briefing-facts.service';

describe('SupportBriefingFactsService', () => {
  it('returns grounded status and escalation facts without inventing SLA data', async () => {
    const now = new Date('2026-11-18T06:00:00.000Z');
    const service = new SupportBriefingFactsService(
      modelWithFind([
        {
          _id: '507f1f77bcf86cd799439011',
          ticketId: 'SR-1001',
          category: 'TECHNICAL',
          subject: 'Calendar connection failed',
          description: 'The calendar connection needs attention.',
          status: SupportRequestStatus.OPEN,
          priority: SupportRequestPriority.URGENT,
          createdAt: now,
          updatedAt: now,
        },
      ]) as unknown as Model<SupportRequest>,
    );

    const result = await service.prepare({
      organizationId: 'org-1',
      from: new Date('2026-11-18T00:00:00.000Z'),
      to: now,
    });

    expect(result.availability).toBe(BriefingFactAvailability.AVAILABLE);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'DERIVED_SUPPORT_METRIC',
          data: expect.objectContaining({ urgent: 1 }),
        }),
        expect.objectContaining({
          sourceType: 'SUPPORT_REQUEST',
          data: expect.objectContaining({
            ticketId: 'SR-1001',
            priority: SupportRequestPriority.URGENT,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('slaPercentage');
  });

  function modelWithFind(value: unknown[]) {
    return { find: jest.fn(() => query(value)) };
  }

  function query(value: unknown) {
    const chain = {
      select: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn(() => Promise.resolve(value)),
    };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    return chain;
  }
});
