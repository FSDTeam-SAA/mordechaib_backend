import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { normalizePhoneNumber } from '../../common/helpers/phone.helper';
import { ContactsService } from '../contacts/contacts.service';
import { TwilioService } from '../twilio/twilio.service';
import { CallsRepository } from './calls.repository';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly twilioService: TwilioService,
    private readonly contacts: ContactsService,
  ) {}

  async createOutboundCall(organizationId: string, dto: CreateOutboundCallDto) {
    const contact = dto.contactId
      ? await this.contacts.resolvePhone(organizationId, dto.contactId)
      : undefined;
    if (!contact && !dto.clientPhone) {
      throw new BadRequestException(
        'Either contactId or clientPhone is required',
      );
    }
    if (
      contact?.phone &&
      dto.clientPhone &&
      normalizePhoneNumber(contact.phone) !==
        normalizePhoneNumber(dto.clientPhone)
    ) {
      throw new BadRequestException(
        'clientPhone does not match the selected contact',
      );
    }

    const clientPhone = contact?.phone || dto.clientPhone!;
    this.logger.log(
      `Initiating outbound call for org ${organizationId} to ${clientPhone}`,
    );
    const result = await this.twilioService.initiateOutboundCall({
      organizationId,
      clientPhone,
      agentPhone: dto.agentPhone,
      contactId: dto.contactId,
    });
    const callRecord = await this.callsRepository.findByCallSid(result.callSid);

    return {
      callSid: result.callSid,
      status: result.status,
      from: result.from,
      to: result.to,
      agentPhone: result.agentPhone,
      contact: contact
        ? { id: String(contact._id), name: contact.name }
        : undefined,
      record: callRecord,
    };
  }

  findOrganizationCalls(organizationId: string) {
    return this.callsRepository.findByOrganization(organizationId);
  }
}
