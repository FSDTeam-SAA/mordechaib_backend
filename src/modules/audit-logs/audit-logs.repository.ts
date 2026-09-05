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
}
