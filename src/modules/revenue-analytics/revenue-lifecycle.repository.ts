import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CancellationRequestStatus } from '../../common/enums/cancellation-request-status.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { CancellationRequest } from '../../database/schemas/cancellation-request.schema';
import { Invoice } from '../../database/schemas/invoice.schema';
import { OrganizationSubscription } from '../../database/schemas/organization-subscription.schema';
import { RevenueDailySnapshot } from '../../database/schemas/revenue-daily-snapshot.schema';
import { RevenueMovement } from '../../database/schemas/revenue-movement.schema';
import { RevenueOrganizationState } from '../../database/schemas/revenue-organization-state.schema';
import { SubscriptionPlan } from '../../database/schemas/subscription-plan.schema';
import {
  RevenueMovementRecord,
  RevenueMovementReadRecord,
  RevenueCohortOrganizationRecord,
  RevenueLifetimeInvoiceRecord,
  RevenuePlanReadRecord,
  RevenuePlanLabelRecord,
  RevenueSnapshotReadRecord,
  RevenueStateRecord,
  RevenueSubscriptionReadRecord,
} from './revenue-lifecycle.types';

@Injectable()
export class RevenueLifecycleRepository {
  constructor(
    @InjectModel(OrganizationSubscription.name)
    private readonly subscriptionModel: Model<OrganizationSubscription>,
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlan>,
    @InjectModel(Invoice.name)
    private readonly invoiceModel: Model<Invoice>,
    @InjectModel(CancellationRequest.name)
    private readonly cancellationModel: Model<CancellationRequest>,
    @InjectModel(RevenueOrganizationState.name)
    private readonly stateModel: Model<RevenueOrganizationState>,
    @InjectModel(RevenueMovement.name)
    private readonly movementModel: Model<RevenueMovement>,
    @InjectModel(RevenueDailySnapshot.name)
    private readonly snapshotModel: Model<RevenueDailySnapshot>,
  ) {}

  async listSubscriptions(afterId: string | undefined, limit: number) {
    const documents = await this.subscriptionModel
      .find(afterId ? { _id: { $gt: new Types.ObjectId(afterId) } } : {})
      .sort({ _id: 1 })
      .limit(limit)
      .lean()
      .exec();

    return documents.map<RevenueSubscriptionReadRecord>((document) => ({
      id: String(document._id),
      organizationId: document.organizationId,
      planId: document.planId,
      status: document.status,
      billingInterval: document.billingInterval === 'year' ? 'year' : 'month',
      pausedUntil: document.pausedUntil,
      currentPeriodStart: document.currentPeriodStart,
      currentPeriodEnd: document.currentPeriodEnd,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      monthlyPriceUsd: document.snapshotLimits?.priceUsd,
      monthlyAddonRevenueUsd: (document.activeAddons ?? []).reduce(
        (sum, addon) => sum + Math.max(0, addon.priceUsd ?? 0),
        0,
      ),
    }));
  }

  async findPlans(planIds: string[]) {
    if (planIds.length === 0) return new Map<string, RevenuePlanReadRecord>();
    const objectIds = planIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const documents = await this.planModel
      .find({ _id: { $in: objectIds } })
      .select({ priceUsd: 1, annualPriceUsd: 1 })
      .lean()
      .exec();

    return new Map(
      documents.map((document) => [
        String(document._id),
        {
          id: String(document._id),
          monthlyPriceUsd: document.priceUsd,
          annualPriceUsd: document.annualPriceUsd,
        },
      ]),
    );
  }

  async findStates(organizationIds: string[]) {
    if (organizationIds.length === 0) {
      return new Map<string, RevenueStateRecord>();
    }
    const documents = await this.stateModel
      .find({ organizationId: { $in: organizationIds } })
      .lean()
      .exec();
    return new Map(
      documents.map((document) => [
        document.organizationId,
        {
          organizationId: document.organizationId,
          subscriptionId: document.subscriptionId,
          planId: document.planId,
          status: document.status,
          billingInterval: document.billingInterval,
          normalizedMrrUsd: document.normalizedMrrUsd,
          revenueActive: document.revenueActive,
          paused: document.paused,
          isEstimated: document.isEstimated,
          availability: document.availability,
          normalizationSource: document.normalizationSource,
          subscriptionStartedAt: document.subscriptionStartedAt,
          currentPeriodStart: document.currentPeriodStart,
          currentPeriodEnd: document.currentPeriodEnd,
          sourceUpdatedAt: document.sourceUpdatedAt,
          observedAt: document.observedAt,
          fingerprint: document.fingerprint,
        },
      ]),
    );
  }

  async findLatestExecutedCancellations(organizationIds: string[]) {
    if (organizationIds.length === 0) return new Map<string, Date>();
    const rows = await this.cancellationModel.aggregate<{
      _id: string;
      executedAt: Date;
    }>([
      {
        $match: {
          organizationId: { $in: organizationIds },
          status: CancellationRequestStatus.EXECUTED,
          executedAt: { $type: 'date' },
        },
      },
      { $sort: { executedAt: -1 } },
      {
        $group: {
          _id: '$organizationId',
          executedAt: { $first: '$executedAt' },
        },
      },
    ]);
    return new Map(rows.map((row) => [row._id, row.executedAt]));
  }

  async sourceCoverage() {
    const [paidInvoices, executedCancellations] = await Promise.all([
      this.invoiceModel.countDocuments({ status: InvoiceStatus.PAID }).exec(),
      this.cancellationModel
        .countDocuments({ status: CancellationRequestStatus.EXECUTED })
        .exec(),
    ]);
    return { paidInvoices, executedCancellations };
  }

  async findOpeningSnapshots(at: Date, planId?: string) {
    const match: Record<string, unknown> = {
      observedAt: { $lte: at },
      subscriptionStartedAt: { $lt: at },
    };
    if (planId) match.planId = planId;
    const rows = await this.snapshotModel.aggregate<RevenueSnapshotReadRecord>([
      { $match: match },
      { $sort: { observedAt: -1 } },
      { $group: { _id: '$organizationId', snapshot: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$snapshot' } },
      {
        $project: {
          _id: 0,
          snapshotDate: 1,
          organizationId: 1,
          planId: 1,
          normalizedMrrUsd: 1,
          revenueActive: 1,
          isEstimated: 1,
          availability: 1,
          subscriptionStartedAt: 1,
          observedAt: 1,
        },
      },
    ]);
    return rows;
  }

  countOrganizationsStartedBefore(at: Date, planId?: string) {
    return this.stateModel
      .countDocuments({
        subscriptionStartedAt: { $lt: at },
        ...(planId ? { planId } : {}),
      })
      .exec();
  }

  async findTrackingStartedAt() {
    const document = await this.snapshotModel
      .findOne()
      .sort({ observedAt: 1 })
      .select({ observedAt: 1 })
      .lean()
      .exec();
    return document?.observedAt;
  }

  async findMovements(from: Date, to: Date, planId?: string) {
    const documents = await this.movementModel
      .find({
        effectiveAt: { $gte: from, $lt: to },
        ...(planId ? { nextPlanId: planId } : {}),
      })
      .sort({ effectiveAt: 1, _id: 1 })
      .lean()
      .exec();
    return documents.map<RevenueMovementReadRecord>((document) => ({
      dedupeKey: document.dedupeKey,
      organizationId: document.organizationId,
      subscriptionId: document.subscriptionId,
      type: document.type,
      previousPlanId: document.previousPlanId,
      nextPlanId: document.nextPlanId,
      previousStatus: document.previousStatus,
      nextStatus: document.nextStatus,
      previousMrrUsd: document.previousMrrUsd,
      nextMrrUsd: document.nextMrrUsd,
      deltaMrrUsd: document.deltaMrrUsd,
      isEstimated: document.isEstimated,
      normalizationSource: document.normalizationSource,
      effectiveAt: document.effectiveAt,
      observedAt: document.observedAt,
    }));
  }

  async findLifetimePaidRevenue(to: Date, planId?: string) {
    return this.invoiceModel.aggregate<RevenueLifetimeInvoiceRecord>([
      {
        $match: {
          status: InvoiceStatus.PAID,
          issuedAt: { $lt: to },
          ...(planId ? { planId } : {}),
        },
      },
      {
        $group: {
          _id: { organizationId: '$organizationId', planId: '$planId' },
          paidRevenueUsd: { $sum: '$amountUsd' },
          firstPaidAt: { $min: '$issuedAt' },
          lastPaidAt: { $max: '$issuedAt' },
          invoiceCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          organizationId: '$_id.organizationId',
          planId: '$_id.planId',
          paidRevenueUsd: 1,
          firstPaidAt: 1,
          lastPaidAt: 1,
          invoiceCount: 1,
        },
      },
    ]);
  }

  async findCohortOrganizations(from: Date, to: Date, planId?: string) {
    const documents = await this.stateModel
      .find({
        subscriptionStartedAt: { $gte: from, $lt: to },
        ...(planId ? { planId } : {}),
      })
      .select({ organizationId: 1, planId: 1, subscriptionStartedAt: 1 })
      .lean()
      .exec();
    return documents.map<RevenueCohortOrganizationRecord>((document) => ({
      organizationId: document.organizationId,
      planId: document.planId,
      subscriptionStartedAt: document.subscriptionStartedAt!,
    }));
  }

  async findSnapshotsAtDates(organizationIds: string[], dates: Date[]) {
    if (organizationIds.length === 0 || dates.length === 0) return [];
    const documents: RevenueSnapshotReadRecord[] = [];
    const batchSize = 1_000;
    for (let offset = 0; offset < organizationIds.length; offset += batchSize) {
      const batch = organizationIds.slice(offset, offset + batchSize);
      const rows = await this.snapshotModel
        .find({
          organizationId: { $in: batch },
          snapshotDate: { $in: dates },
        })
        .select({
          snapshotDate: 1,
          organizationId: 1,
          planId: 1,
          normalizedMrrUsd: 1,
          revenueActive: 1,
          isEstimated: 1,
          availability: 1,
          subscriptionStartedAt: 1,
          observedAt: 1,
        })
        .lean()
        .exec();
      documents.push(...rows);
    }
    return documents.map<RevenueSnapshotReadRecord>((document) => ({
      snapshotDate: document.snapshotDate,
      organizationId: document.organizationId,
      planId: document.planId,
      normalizedMrrUsd: document.normalizedMrrUsd,
      revenueActive: document.revenueActive,
      isEstimated: document.isEstimated,
      availability: document.availability,
      subscriptionStartedAt: document.subscriptionStartedAt,
      observedAt: document.observedAt,
    }));
  }

  async findPlanLabels(planIds: string[]) {
    if (planIds.length === 0) return new Map<string, RevenuePlanLabelRecord>();
    const objectIds = planIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const documents = await this.planModel
      .find({ _id: { $in: objectIds } })
      .select({ name: 1 })
      .lean()
      .exec();
    return new Map(
      documents.map((document) => [
        String(document._id),
        { id: String(document._id), name: document.name },
      ]),
    );
  }

  async persistBatch(input: {
    states: RevenueStateRecord[];
    movements: RevenueMovementRecord[];
    snapshotDate: Date;
  }) {
    if (input.movements.length > 0) {
      await this.movementModel.bulkWrite(
        input.movements.map((movement) => ({
          updateOne: {
            filter: { dedupeKey: movement.dedupeKey },
            update: { $setOnInsert: movement },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    if (input.states.length === 0) return;

    await this.stateModel.bulkWrite(
      input.states.map((state) => ({
        updateOne: {
          filter: { organizationId: state.organizationId },
          update: { $set: state },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    await this.snapshotModel.bulkWrite(
      input.states.map((state) => ({
        updateOne: {
          filter: {
            snapshotDate: input.snapshotDate,
            organizationId: state.organizationId,
          },
          update: {
            $set: {
              snapshotDate: input.snapshotDate,
              organizationId: state.organizationId,
              subscriptionId: state.subscriptionId,
              planId: state.planId,
              status: state.status,
              billingInterval: state.billingInterval,
              normalizedMrrUsd: state.normalizedMrrUsd,
              revenueActive: state.revenueActive,
              paused: state.paused,
              isEstimated: state.isEstimated,
              availability: state.availability,
              normalizationSource: state.normalizationSource,
              subscriptionStartedAt: state.subscriptionStartedAt,
              sourceUpdatedAt: state.sourceUpdatedAt,
              observedAt: state.observedAt,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
}
