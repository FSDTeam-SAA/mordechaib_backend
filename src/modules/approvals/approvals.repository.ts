import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Approval,
  ApprovalStatus,
} from '../../database/schemas/approval.schema';

type CreateApprovalInput = {
  organizationId: string;
  actionType: string;
  provider?: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class ApprovalsRepository {
  constructor(
    @InjectModel(Approval.name) private readonly approvalModel: Model<Approval>,
  ) {}

  create(input: CreateApprovalInput) {
    return this.approvalModel.create({
      organizationId: input.organizationId,
      actionType: input.actionType,
      provider: input.provider,
      payload: input.payload,
    });
  }

  findByOrganization(organizationId: string) {
    return this.approvalModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async updateStatus(id: string, status: ApprovalStatus) {
    const approval = await this.approvalModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .lean()
      .exec();

    if (!approval) throw new NotFoundException('Approval not found');
    return approval;
  }
}
