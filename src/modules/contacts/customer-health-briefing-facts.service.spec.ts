import { Model } from 'mongoose';
import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import { CustomerContact } from '../../database/schemas/customer-contact.schema';
import { CustomerHealthSnapshot } from '../../database/schemas/customer-health-snapshot.schema';
import { CustomerHealthBriefingFactsService } from './customer-health-briefing-facts.service';

describe('CustomerHealthBriefingFactsService', () => {
  it('returns grounded customer-linked health snapshots', async () => {
    const capturedAt = new Date('2026-11-12T08:00:00.000Z');
    const snapshots = modelWithFind([
      {
        _id: 'snapshot-1',
        contactId: 'contact-1',
        source: { type: 'CALL_TRANSCRIPT', id: 'call-1' },
        healthScore: 82,
        riskLevel: 'LOW',
        analysisConfidence: 0.9,
        capturedAt,
      },
    ]) as unknown as Model<CustomerHealthSnapshot>;
    const contacts = modelWithFind([
      {
        _id: 'contact-1',
        name: 'Amit Customer',
        email: 'amit@example.com',
        company: 'Example Ltd.',
      },
    ]) as unknown as Model<CustomerContact>;
    const service = new CustomerHealthBriefingFactsService(snapshots, contacts);

    const result = await service.prepare({
      organizationId: 'org-1',
      from: new Date('2026-11-09T00:00:00.000Z'),
      to: new Date('2026-11-16T00:00:00.000Z'),
    });

    expect(result.availability).toBe(BriefingFactAvailability.AVAILABLE);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        sourceType: 'CUSTOMER_HEALTH_SNAPSHOT',
        capturedAt: capturedAt.toISOString(),
        data: expect.objectContaining({
          contactId: 'contact-1',
          customerName: 'Amit Customer',
          healthScore: 82,
          riskLevel: 'LOW',
        }),
      }),
    );
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
