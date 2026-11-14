import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from '../../database/schemas/audit-log.schema';

@Injectable()
export class AuditLogsRepository {
  constructor(
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLog>,
  ) {}

  create(input: {
    organizationId: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.auditLogModel.create(input);
  }

  findByOrganization(organizationId: string) {
    return this.auditLogModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async countByActions(
    actions: string[],
    range: { from: Date; to: Date },
  ): Promise<Record<string, number>> {
    if (!actions.length) return {};
    const rows = await this.auditLogModel
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            action: { $in: actions },
            createdAt: { $gte: range.from, $lt: range.to },
          },
        },
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ])
      .exec();
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  countByOrganizationAndAction(organizationId: string, action: string) {
    return this.auditLogModel.countDocuments({ organizationId, action }).exec();
  }
}
