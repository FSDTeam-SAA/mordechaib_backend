import { ContactsService } from '../contacts/contacts.service';
import { TwilioService } from '../twilio/twilio.service';
import { CallsRepository } from './calls.repository';
import { CallsService } from './calls.service';

describe('CallsService', () => {
  it('resolves the customer phone from contactId before calling', async () => {
    const calls = {
      findByCallSid: jest.fn().mockResolvedValue({ callSid: 'CA123' }),
    };
    const twilio = {
      initiateOutboundCall: jest.fn().mockResolvedValue({
        callSid: 'CA123',
        status: 'INITIATED',
        from: '+14155550123',
        to: '+8801812345678',
        agentPhone: '+8801712345678',
      }),
    };
    const contacts = {
      resolvePhone: jest.fn().mockResolvedValue({
        _id: '66cc9bdfa847ea856c7b41d2',
        name: 'Tahid Rahman',
        phone: '+8801812345678',
      }),
    };
    const service = new CallsService(
      calls as unknown as CallsRepository,
      twilio as unknown as TwilioService,
      contacts as unknown as ContactsService,
    );

    const result = await service.createOutboundCall('org-1', {
      contactId: '66cc9bdfa847ea856c7b41d2',
    });

    expect(twilio.initiateOutboundCall).toHaveBeenCalledWith({
      organizationId: 'org-1',
      clientPhone: '+8801812345678',
      agentPhone: undefined,
      contactId: '66cc9bdfa847ea856c7b41d2',
    });
    expect(result.contact).toEqual({
      id: '66cc9bdfa847ea856c7b41d2',
      name: 'Tahid Rahman',
    });
  });
});
