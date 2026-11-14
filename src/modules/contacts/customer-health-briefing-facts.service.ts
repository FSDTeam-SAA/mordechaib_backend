import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import { AiFact, boundedRows } from '../../common/helpers/ai-fact.helper';
import { CustomerContact } from '../../database/schemas/customer-contact.schema';
import { CustomerHealthSnapshot } from '../../database/schemas/customer-health-snapshot.schema';

const CUSTOMER_HEALTH_FACT_LIMIT = 100;

@Injectable()
export class CustomerHealthBriefingFactsService {
  constructor(
    @InjectModel(CustomerHealthSnapshot.name)
    private readonly snapshots: Model<CustomerHealthSnapshot>,
    @InjectModel(CustomerContact.name)
    private readonly contacts: Model<CustomerContact>,
  ) {}

  async prepare(input: { organizationId: string; from: Date; to: Date }) {
    const rows = await this.snapshots
      .find({
        organizationId: input.organizationId,
        capturedAt: { $gte: input.from, $lt: input.to },
      })
      .select(
        'contactId source healthScore riskLevel analysisConfidence capturedAt createdAt updatedAt',
      )
      .sort({ capturedAt: -1, _id: -1 })
      .limit(CUSTOMER_HEALTH_FACT_LIMIT + 1)
      .lean()
      .exec();
    const bounded = boundedRows(rows, CUSTOMER_HEALTH_FACT_LIMIT);
    if (!bounded.items.length) {
      return {
        availability: BriefingFactAvailability.UNAVAILABLE,
        items: [] as AiFact[],
      };
    }
    const contactIds = [...new Set(bounded.items.map((row) => row.contactId))];
    const contacts = await this.contacts
      .find({
        organizationId: input.organizationId,
        _id: { $in: contactIds },
        deletedAt: { $exists: false },
      })
      .select('name email company')
      .lean()
      .exec();
    const contactById = new Map(
      contacts.map((contact) => [String(contact._id), contact]),
    );
    const snapshotsByContact = new Map<
      string,
      (typeof bounded.items)[number][]
    >();
    for (const snapshot of bounded.items) {
      const current = snapshotsByContact.get(snapshot.contactId) || [];
      current.push(snapshot);
      snapshotsByContact.set(snapshot.contactId, current);
    }
    return {
      availability: bounded.truncated
        ? BriefingFactAvailability.PARTIAL
        : BriefingFactAvailability.AVAILABLE,
      items: [...snapshotsByContact.entries()].map(([contactId, history]) => {
        const latest = history[0];
        const previous = history[1];
        const scoreChange = previous
          ? Number((latest.healthScore - previous.healthScore).toFixed(2))
          : null;
        const contact = contactById.get(contactId);
        return {
          id: `customer-health-${String(latest._id)}`,
          sourceType: 'CUSTOMER_HEALTH_SNAPSHOT',
          sourceId: String(latest._id),
          capturedAt: new Date(latest.capturedAt).toISOString(),
          data: {
            title: contact?.name || 'Customer health snapshot',
            contactId,
            customerName: contact?.name,
            customerEmail: contact?.email,
            company: contact?.company,
            healthScore: latest.healthScore,
            riskLevel: latest.riskLevel,
            analysisConfidence: latest.analysisConfidence,
            lastInteractionAt: new Date(latest.capturedAt).toISOString(),
            interactionSource: latest.source,
            observedInteractions: history.length,
            previousHealthScore: previous?.healthScore,
            healthScoreChange: scoreChange,
            healthTrend:
              scoreChange === null
                ? 'UNKNOWN'
                : scoreChange > 0
                  ? 'IMPROVING'
                  : scoreChange < 0
                    ? 'DECLINING'
                    : 'STABLE',
            scope:
              'Persisted customer-linked interaction health; this is not NPS, churn probability, or renewal probability.',
          },
        } satisfies AiFact;
      }),
    };
  }
}
