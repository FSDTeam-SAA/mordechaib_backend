import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { EmailConnectionsService } from '../email/email-connections.service';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const repository = {
    findByOrganization: jest.fn(),
    findTwilioAccount: jest.fn(),
    findTwilioSetting: jest.fn(),
    findActiveTwilioPhoneNumber: jest.fn(),
  };
  const emailConnections = { list: jest.fn() };
  const service = new IntegrationsService(
    repository as unknown as IntegrationsRepository,
    emailConnections as unknown as EmailConnectionsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findTwilioAccount.mockResolvedValue(null);
    repository.findTwilioSetting.mockResolvedValue(null);
    repository.findActiveTwilioPhoneNumber.mockResolvedValue(null);
    emailConnections.list.mockResolvedValue([]);
  });

  it('returns the organization Zoom connection as an integration card', async () => {
    repository.findByOrganization.mockResolvedValue([
      {
        provider: IntegrationProvider.ZOOM,
        status: 'CONNECTED',
        metadata: {
          providerAccountId: 'zoom-account-1',
          providerEmail: 'owner@example.com',
          providerName: 'Owner',
          connectedByUserId: 'user-1',
        },
      },
    ]);

    const result = await service.findAll('org-1', 'user-1');

    expect(result.items).toContainEqual(
      expect.objectContaining({
        provider: IntegrationProvider.ZOOM,
        label: 'Zoom',
        connected: true,
        status: 'CONNECTED',
        connectPath: '/zoom-meetings/oauth/connect',
        account: {
          id: 'zoom-account-1',
          email: 'owner@example.com',
          name: 'Owner',
        },
        connectedByUserId: 'user-1',
      }),
    );
  });

  it('returns Twilio numbers, capabilities, and enabled platform features', async () => {
    repository.findByOrganization.mockResolvedValue([]);
    repository.findTwilioAccount.mockResolvedValue({
      subaccountSid: 'AC123',
      friendlyName: 'Noltra - org-1',
      provisioningStatus: 'ACTIVE',
      selectedCountry: 'US',
      selectedPhoneNumber: '+14155550123',
      forwardingNumber: '+8801712345678',
    });
    repository.findTwilioSetting.mockResolvedValue({
      twilioNumber: '+14155550123',
      forwardingNumber: '+8801712345678',
      isRecordingEnabled: true,
      status: 'ACTIVE',
    });
    repository.findActiveTwilioPhoneNumber.mockResolvedValue({
      phoneNumber: '+14155550123',
      country: 'US',
      numberType: 'LOCAL',
      capabilities: { voice: true, sms: true, mms: true },
    });

    const result = await service.findAll('org-1', 'user-1');

    expect(result.items).toContainEqual(
      expect.objectContaining({
        provider: IntegrationProvider.TWILIO,
        connected: true,
        account: {
          id: 'AC123',
          name: 'Noltra - org-1',
          phoneNumber: '+14155550123',
        },
        configuration: {
          twilioNumber: '+14155550123',
          forwardingNumber: '+8801712345678',
          country: 'US',
          numberType: 'LOCAL',
          numberCapabilities: { voice: true, sms: true, mms: true },
          enabledFeatures: {
            voice: true,
            sms: false,
            mms: false,
            callRecording: true,
          },
        },
      }),
    );
  });
});
