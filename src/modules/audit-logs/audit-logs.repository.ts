import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditLogsRepository {
  findAll() {
    return { module: 'audit-logs', items: [] };
  }
}
