import { ConfigService } from '@nestjs/config';
import { HubSpotProvider } from './hubspot.provider';

describe('HubSpotProvider', () => {
  const values: Record<string, unknown> = {
    'crm.hubspot.clientId': 'client-id',
    'crm.hubspot.clientSecret': 'client-secret',
    'crm.hubspot.redirectUri': 'https://api.example.com/hubspot/callback',
    'crm.hubspot.requiredScopes': [
      'oauth',
      'crm.objects.contacts.read',
      'crm.objects.deals.read',
    ],
    'crm.hubspot.optionalScopes': [
      'crm.objects.companies.read',
      'crm.objects.custom.read',
    ],
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  };
  const provider = new HubSpotProvider(config as unknown as ConfigService);
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses required and optional capability scopes in the authorization URL', () => {
    const url = new URL(provider.authorizationUrl('state-1'));

    expect(url.searchParams.get('scope')?.split(' ')).toEqual([
      'oauth',
      'crm.objects.contacts.read',
      'crm.objects.deals.read',
    ]);
    expect(url.searchParams.get('optional_scope')?.split(' ')).toEqual([
      'crm.objects.companies.read',
      'crm.objects.custom.read',
    ]);
  });

  it('discovers tasks through the granted contact activity capability', async () => {
    const objects = await provider.listObjects('access-token', {
      scopes: ['crm.objects.contacts.read', 'crm.objects.deals.read'],
    });

    expect(objects.map(({ objectType }) => objectType)).toEqual([
      'contacts',
      'deals',
      'tasks',
    ]);
  });

  it('creates and normalizes a dynamic CRM record', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'product-1',
          createdAt: '2026-10-24T04:00:00.000Z',
          updatedAt: '2026-10-24T04:00:00.000Z',
          properties: { name: 'Premium plan', price: '250' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.createRecord('access-token', {
      objectType: 'products',
      properties: { name: 'Premium plan', price: 250 },
      fields: ['name', 'price'],
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.hubapi.com/crm/v3/objects/products');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      properties: { name: 'Premium plan', price: 250 },
    });
    expect(result).toEqual(
      expect.objectContaining({
        objectType: 'products',
        externalId: 'product-1',
        properties: { name: 'Premium plan', price: '250' },
      }),
    );
  });

  it('updates and reloads a dynamic CRM record with the requested fields', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'product-1',
            updatedAt: '2026-10-27T10:00:00.000Z',
            properties: { price: '275' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'product-1',
            createdAt: '2026-10-24T04:00:00.000Z',
            updatedAt: '2026-10-27T10:00:00.000Z',
            properties: { name: 'Premium plan', price: '275' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await provider.updateRecord('access-token', {
      objectType: 'products',
      externalId: 'product-1',
      properties: { price: 275 },
      fields: ['name', 'price'],
    });

    const calls = (global.fetch as jest.Mock).mock.calls as Array<
      [string, RequestInit]
    >;
    expect(calls[0][0]).toBe(
      'https://api.hubapi.com/crm/v3/objects/products/product-1',
    );
    expect(calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(String(calls[0][1].body))).toEqual({
      properties: { price: 275 },
    });
    expect(calls[1][0]).toBe(
      'https://api.hubapi.com/crm/v3/objects/products/product-1?properties=name%2Cprice',
    );
    expect(result.properties).toEqual({
      name: 'Premium plan',
      price: '275',
    });
  });
});
