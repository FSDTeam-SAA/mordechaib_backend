import { Injectable } from '@nestjs/common';
import { ApprovalStatus } from '../../database/schemas/approval.schema';
import { ApprovalsRepository } from './approvals.repository';

@Injectable()
export class ApprovalsService {
  constructor(private readonly approvalsRepository: ApprovalsRepository) {}

  createApproval(input: {
    organizationId: string;
    actionType: string;
    provider?: string;
    payload: Record<string, unknown>;
  }) {
    return this.approvalsRepository.create(input);
  }

  findByOrganization(organizationId: string) {
    return this.approvalsRepository.findByOrganization(organizationId);
  }

  approve(organizationId: string, id: string) {
    return this.approvalsRepository.updateStatus(
      organizationId,
      id,
      ApprovalStatus.APPROVED,
    );
  }

  reject(organizationId: string, id: string) {
    return this.approvalsRepository.updateStatus(
      organizationId,
      id,
      ApprovalStatus.REJECTED,
    );
  }
}
