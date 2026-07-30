import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallLog } from '../../database/schemas/call-log.schema';

type CreateCallInput = {
  organizationId: string;
  callSid: string;
  fromNumber: string;
  toNumber: string;
  direction: string;
  status: string;
};

@Injectable()
export class CallsRepository {
  constructor(
    @InjectModel(CallLog.name) private readonly callModel: Model<CallLog>,
  ) {}

  create(data: CreateCallInput) {
    return this.callModel.create(data);
  }

  findByOrganization(organizationId: string) {
    return this.callModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
