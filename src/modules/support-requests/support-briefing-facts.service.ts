import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import {
  SupportRequestPriority,
  SupportRequestStatus,
} from '../../common/enums/support-request.enum';
import {
  boundedAiText,
  boundedRows,
  createAiFact,
  type AiFact,
} from '../../common/helpers/ai-fact.helper';
import { SupportRequest } from '../../database/schemas/support-request.schema';

const SUPPORT_FACT_LIMIT = 100;

@Injectable()
export class SupportBriefingFactsService {
  constructor(
    @InjectModel(SupportRequest.name)
    private readonly requests: Model<SupportRequest>,
  ) {}

  async prepare(input: { organizationId: string; from: Date; to: Date }) {
    const rows = await this.requests
      .find({
        organizationId: input.organizationId,
        deletedAt: { $exists: false },
        $or: [
          { createdAt: { $gte: input.from, $lt: input.to } },
          { updatedAt: { $gte: input.from, $lt: input.to } },
          {
            status: {
              $in: [
                SupportRequestStatus.OPEN,
                SupportRequestStatus.IN_PROGRESS,
              ],
            },
            priority: {
              $in: [SupportRequestPriority.HIGH, SupportRequestPriority.URGENT],
            },
          },
        ],
      })
      .select(
        'ticketId category subject description status priority assignedToUserId statusChangedAt createdAt updatedAt',
      )
      .sort({ priority: -1, updatedAt: -1, _id: -1 })
      .limit(SUPPORT_FACT_LIMIT + 1)
      .lean()
      .exec();
    const bounded = boundedRows(rows, SUPPORT_FACT_LIMIT);
    const items: AiFact[] = bounded.items.map((request) =>
      createAiFact('support-request', 'SUPPORT_REQUEST', request, {
        title: request.subject,
        ticketId: request.ticketId,
        category: request.category,
        description: boundedAiText(request.description, 2_000),
        status: request.status,
        priority: request.priority,
        assignedToUserId: request.assignedToUserId,
        statusChangedAt: request.statusChangedAt?.toISOString(),
        scope:
          'Organization support request status and priority only; SLA compliance is not inferred because no SLA target is persisted.',
      }),
    );
    if (bounded.items.length) {
      items.unshift({
        id: `support-summary-${input.from.toISOString()}-${input.to.toISOString()}`,
        sourceType: 'DERIVED_SUPPORT_METRIC',
        sourceId: `support:${input.from.toISOString()}:${input.to.toISOString()}`,
        capturedAt: input.to.toISOString(),
        data: {
          title: 'Support request status summary',
          totalRelevantRequests: bounded.items.length,
          open: this.count(bounded.items, SupportRequestStatus.OPEN),
          inProgress: this.count(
            bounded.items,
            SupportRequestStatus.IN_PROGRESS,
          ),
          resolved: this.count(bounded.items, SupportRequestStatus.RESOLVED),
          closed: this.count(bounded.items, SupportRequestStatus.CLOSED),
          highPriority: bounded.items.filter(
            (item) => item.priority === SupportRequestPriority.HIGH,
          ).length,
          urgent: bounded.items.filter(
            (item) => item.priority === SupportRequestPriority.URGENT,
          ).length,
          derivation:
            'Calculated from relevant organization support requests; no SLA percentage is calculated.',
        },
      });
    }
    return {
      availability: bounded.truncated
        ? BriefingFactAvailability.PARTIAL
        : BriefingFactAvailability.AVAILABLE,
      items,
    };
  }

  private count(
    rows: Array<{ status: SupportRequestStatus }>,
    status: SupportRequestStatus,
  ) {
    return rows.filter((item) => item.status === status).length;
  }
}
