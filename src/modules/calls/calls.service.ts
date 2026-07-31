import { Injectable } from '@nestjs/common';
import { CallDirection } from '../../common/enums/call-direction.enum';
import { CallStatus } from '../../common/enums/call-status.enum';
import { TwilioService } from '../twilio/twilio.service';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';
import { CallsRepository } from './calls.repository';

@Injectable()
export class CallsService {
  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly twilioService: TwilioService,
  ) {}

  async createOutboundCall(organizationId: string, dto: CreateOutboundCallDto) {
    const call = await this.twilioService.startClickToCall({
      organizationId,
      clientPhone: dto.clientPhone,
    });

    return this.callsRepository.create({
      organizationId,
      callSid: call.callSid,
      fromNumber: call.from,
      toNumber: dto.clientPhone,
      direction: CallDirection.OUTBOUND,
      status: CallStatus.INITIATED,
    });
  }

  findOrganizationCalls(organizationId: string) {
    return this.callsRepository.findByOrganization(organizationId);
  }
}
