import { BadRequestException, ConflictException } from '@nestjs/common';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRecordMutationsService } from './crm-record-mutations.service';
import { CrmRecordsRepository } from './crm-records.repository';

describe('CrmRecordMutationsService', () => {
  const organizationId = 'organization-1';
  const updatedAt = new Date('2026-10-23T06:00:00.000Z');
  const provider = {
    describeObject: jest.fn(),
    updateRecord: jest.fn(),
  };
  const connections = {
    execute: jest.fn(async (_organizationId, _provider, operation) =>
      operation({
        accessToken: 'token',
        metadata: { scopes: ['crm.objects.products.write'] },
      }),
    ),
  };
  const providers = { get: jest.fn(() => provider) };
  const records = {
    findByExternalId: jest.fn(),
    upsertMany: jest.fn(),
  };
  let service: CrmRecordMutationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CrmRecordMutationsService(
      connections as unknown as CrmConnectionsService,
      providers as unknown as CrmProviderRegistry,
      records as unknown as CrmRecordsRepository,
    );
    provider.describeObject.mockResolvedValue({
      objectType: 'products',
      label: 'Product',
      pluralLabel: 'Products',
      custom: false,
      readable: true,
      createable: true,
      updateable: true,
      deletable: true,
      fields: [
        {
          name: 'price',
          label: 'Price',
          dataType: 'NUMBER',
          providerType: 'number',
          custom: false,
          required: false,
          readable: true,
          createable: true,
          updateable: true,
          filterable: true,
          sortable: true,
          unique: false,
          calculated: false,
          referenceTo: [],
          options: [],
        },
      ],
    });
    records.findByExternalId.mockResolvedValue({
      _id: 'record-1',
      archived: false,
      providerUpdatedAt: updatedAt,
      properties: { price: 100 },
    });
    records.upsertMany.mockResolvedValue({ processed: 1 });
  });

  it('builds an authoritative before/after preview', async () => {
    const result = await service.prepareUpdate(organizationId, {
      provider: IntegrationProvider.HUBSPOT,
      objectType: 'products',
      externalId: 'product-1',
      properties: { price: 125 },
      expectedProviderUpdatedAt: updatedAt.toISOString(),
    });

    expect(result.preview).toEqual({
      recordId: 'record-1',
      before: { price: 100 },
      after: { price: 125 },
    });
    expect(result.schemaFingerprint).toHaveLength(64);
  });

  it('rejects fields that are absent from the authoritative schema', async () => {
    await expect(
      service.prepareUpdate(organizationId, {
        provider: IntegrationProvider.HUBSPOT,
        objectType: 'products',
        externalId: 'product-1',
        properties: { imaginaryField: 'value' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a stale proposal before provider execution', async () => {
    await expect(
      service.prepareUpdate(organizationId, {
        provider: IntegrationProvider.HUBSPOT,
        objectType: 'products',
        externalId: 'product-1',
        properties: { price: 125 },
        expectedProviderUpdatedAt: '2026-10-22T06:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('executes through the provider adapter and refreshes the local record', async () => {
    provider.updateRecord.mockResolvedValue({
      objectType: 'products',
      externalId: 'product-1',
      properties: { price: 125 },
      providerUpdatedAt: new Date('2026-10-23T06:05:00.000Z'),
      archived: false,
    });
    const prepared = await service.prepareUpdate(organizationId, {
      provider: IntegrationProvider.HUBSPOT,
      objectType: 'products',
      externalId: 'product-1',
      properties: { price: 125 },
      expectedProviderUpdatedAt: updatedAt.toISOString(),
    });

    const result = await service.executeUpdate(organizationId, prepared);

    expect(provider.updateRecord).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        objectType: 'products',
        externalId: 'product-1',
        properties: { price: 125 },
      }),
    );
    expect(records.upsertMany).toHaveBeenCalled();
    expect(result.id).toBe('record-1');
  });
});
