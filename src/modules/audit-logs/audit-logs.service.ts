import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';

@Injectable()
export class AuditLogsService {
  constructor(private readonly repository: AuditLogsRepository) {}

  create(input: {
    organizationId: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.repository.create(input);
  }

  findByOrganization(organizationId: string) {
    return this.repository.findByOrganization(organizationId);
  }
}
