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
});
