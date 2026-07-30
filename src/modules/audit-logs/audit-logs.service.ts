import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';

@Injectable()
export class AuditLogsService {
  constructor(private readonly repository: AuditLogsRepository) {}

  findAll() {
    return this.repository.findAll();
  }
}
