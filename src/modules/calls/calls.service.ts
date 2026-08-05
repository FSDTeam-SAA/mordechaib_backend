import { Injectable, Logger } from '@nestjs/common';
import { TwilioService } from '../twilio/twilio.service';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';
import { CallsRepository } from './calls.repository';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly twilioService: TwilioService,
  ) {}

  /**
   * Initiates a click-to-call outbound call for an organization.
   *
   * The TwilioService handles the full flow:
   *   1. Looks up the organization's active Twilio setting (twilio number +
   *      forwarding/agent number).
   *   2. Places the first leg to the agent's phone.
   *   3. On answer, Twilio fetches outbound-connect TwiML which dials the
   *      client and bridges both legs.
   *   4. Records the call in MongoDB (works in mock mode too).
   */
  async createOutboundCall(organizationId: string, dto: CreateOutboundCallDto) {
    this.logger.log(
      `Initiating outbound call for org ${organizationId} → ${dto.clientPhone}`,
    );

    const result = await this.twilioService.initiateOutboundCall({
      organizationId,
      clientPhone: dto.clientPhone,
      agentPhone: dto.agentPhone,
    });

    const callRecord = await this.callsRepository.findByCallSid(result.callSid);

    return {
      callSid: result.callSid,
      status: result.status,
      from: result.from,
      to: result.to,
      agentPhone: result.agentPhone,
      record: callRecord,
    };
  }

  findOrganizationCalls(organizationId: string) {
    return this.callsRepository.findByOrganization(organizationId);
  }
}