import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { EmailConnectionsService } from '../email/email-connections.service';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const repository = {
    findByOrganization: jest.fn(),
    findTwilioAccount: jest.fn(),
    findTwilioSetting: jest.fn(),
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
});
