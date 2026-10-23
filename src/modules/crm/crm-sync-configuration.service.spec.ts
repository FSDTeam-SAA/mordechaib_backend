import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmRepository } from './crm.repository';
import { CrmSchemaDiscoveryService } from './crm-schema-discovery.service';
import { CrmSchemaPresentationService } from './crm-schema-presentation.service';
import { CrmSyncConfigurationService } from './crm-sync-configuration.service';

describe('CrmSyncConfigurationService', () => {
  const connections = { resolve: jest.fn() };
  const discovery = {
    listObjects: jest.fn(),
    describeObject: jest.fn(),
  };
  const repository = { updateObjectSync: jest.fn() };
  const audits = { create: jest.fn() };
  const presentation = { essentialFields: jest.fn() };
  const service = new CrmSyncConfigurationService(
    connections as unknown as CrmConnectionsService,
    discovery as unknown as CrmSchemaDiscoveryService,
    repository as unknown as CrmRepository,
    audits as unknown as AuditLogsService,
    presentation as unknown as CrmSchemaPresentationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.updateObjectSync.mockResolvedValue({ id: 'connection-1' });
  });

  it('creates an organization-scoped default from readable provider objects', async () => {
    connections.resolve.mockResolvedValue({ metadata: {} });
    discovery.listObjects.mockResolvedValue({
      provider: IntegrationProvider.HUBSPOT,
      objects: [
        { objectType: 'contacts', label: 'Contacts', readable: true },
        { objectType: 'deals', label: 'Deals', readable: true },
        { objectType: 'tickets', label: 'Tickets', readable: false },
        { objectType: 'calls', label: 'Calls', readable: true },
      ],
    });
    discovery.describeObject.mockImplementation(
      (_organizationId: string, _provider: string, objectType: string) =>
        Promise.resolve({ objectType, fields: [] }),
    );
    presentation.essentialFields
      .mockReturnValueOnce(['email', 'firstname'])
      .mockReturnValueOnce(['dealname', 'amount'])
      .mockReturnValueOnce(['hs_call_title']);

    const result = await service.ensureAutomatic(
      'org-1',
      IntegrationProvider.HUBSPOT,
    );

    expect(result.created).toBe(true);
    expect(result.configuration).toMatchObject({
      schemaVersion: '1.0',
      configuredBy: 'AUTOMATIC',
      objects: [
        { objectType: 'contacts', fields: ['email', 'firstname'] },
        { objectType: 'deals', fields: ['dealname', 'amount'] },
        { objectType: 'calls', fields: ['hs_call_title'] },
      ],
    });
    expect(repository.updateObjectSync).toHaveBeenCalledWith(
      'org-1',
      IntegrationProvider.HUBSPOT,
      result.configuration,
      [
        { objectType: 'contacts', status: 'IDLE' },
        { objectType: 'deals', status: 'IDLE' },
        { objectType: 'calls', status: 'IDLE' },
      ],
    );
  });

  it('reconciles a stale automatic configuration with newly available objects', async () => {
    const configuration = {
      schemaVersion: '1.0',
      configuredBy: 'AUTOMATIC',
      updatedAt: '2026-10-20T10:00:00.000Z',
      objects: [{ objectType: 'contacts', fields: ['email'] }],
    };
    connections.resolve.mockResolvedValue({
      metadata: {
        scopes: ['crm.objects.contacts.read', 'crm.objects.companies.read'],
        objectSync: {
          configuration,
          objects: [
            {
              objectType: 'contacts',
              status: 'SYNCHRONIZED',
              lastSyncedAt: '2026-10-21T10:00:00.000Z',
            },
          ],
        },
      },
    });
    discovery.listObjects.mockResolvedValue({
      provider: IntegrationProvider.HUBSPOT,
      objects: [
        { objectType: 'contacts', label: 'Contacts', readable: true },
        { objectType: 'companies', label: 'Companies', readable: true },
      ],
    });
    discovery.describeObject.mockImplementation(
      (_organizationId: string, _provider: string, objectType: string) =>
        Promise.resolve({ objectType, fields: [] }),
    );
    presentation.essentialFields
      .mockReturnValueOnce(['email'])
      .mockReturnValueOnce(['name']);

    const result = await service.ensureAutomatic(
      'org-1',
      IntegrationProvider.HUBSPOT,
    );

    expect(result).toMatchObject({
      created: false,
      reconciled: true,
      configuration: {
        configuredBy: 'AUTOMATIC',
        objects: [
          { objectType: 'contacts', fields: ['email'] },
          { objectType: 'companies', fields: ['name'] },
        ],
      },
      objects: [
        {
          objectType: 'contacts',
          status: 'SYNCHRONIZED',
        },
        { objectType: 'companies', status: 'IDLE' },
      ],
    });
  });

  it('preserves an existing configuration without provider discovery', async () => {
    const configuration = {
      schemaVersion: '1.0',
      configuredBy: 'USER',
      updatedAt: '2026-10-22T10:00:00.000Z',
      objects: [],
    };
    connections.resolve.mockResolvedValue({
      metadata: { objectSync: { configuration, objects: [] } },
    });

    await expect(
      service.ensureAutomatic('org-1', IntegrationProvider.HUBSPOT),
    ).resolves.toEqual({
      provider: IntegrationProvider.HUBSPOT,
      created: false,
      configuration,
      objects: [],
    });
    expect(discovery.listObjects).not.toHaveBeenCalled();
    expect(repository.updateObjectSync).not.toHaveBeenCalled();
  });
});
