import { ConfigService } from '@nestjs/config';
import { SalesforceProvider } from './salesforce.provider';

describe('SalesforceProvider PKCE', () => {
  const values: Record<string, unknown> = {
    'crm.salesforce.clientId': 'client-id',
    'crm.salesforce.clientSecret': 'client-secret',
    'crm.salesforce.loginUrl': 'https://login.salesforce.com',
    'crm.salesforce.redirectUri':
      'http://localhost:5000/api/v1/crm/connections/SALESFORCE/callback',
    'crm.salesforce.scopes': ['api', 'refresh_token', 'id'],
    'crm.requestTimeoutMs': 20_000,
  };
  const provider = new SalesforceProvider({
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService);
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('adds an S256 code challenge to the authorization URL', () => {
    const url = new URL(
      provider.authorizationUrl('oauth-state', {
        codeChallenge: 'generated-challenge',
      }),
    );

    expect(url.searchParams.get('code_challenge')).toBe('generated-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('oauth-state');
  });

  it('sends the matching verifier during authorization-code exchange', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          instance_url: 'https://example.my.salesforce.com',
          id: 'https://login.salesforce.com/id/org/user',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await provider.exchangeCode('authorization-code', {
      codeVerifier: 'stored-verifier',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(String(init.body)).toContain('code_verifier=stored-verifier');
  });

  it('omits unavailable CurrencyIsoCode and uses the org currency', async () => {
    let queryUrl = '';
    global.fetch = jest.fn().mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/sobjects/Opportunity/describe')) {
        return new Response(
          JSON.stringify({
            fields: [
              { name: 'Id' },
              { name: 'Name' },
              { name: 'Amount' },
              { name: 'StageName' },
              { name: 'CloseDate' },
              { name: 'LastModifiedDate' },
              { name: 'IsClosed' },
              { name: 'IsWon' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/services/Soap/u/')) {
        return new Response(
          `<Envelope><Body><getUserInfoResponse><result>
            <organizationMultiCurrency>false</organizationMultiCurrency>
            <orgDefaultCurrencyIsoCode>BDT</orgDefaultCurrencyIsoCode>
          </result></getUserInfoResponse></Body></Envelope>`,
          { status: 200, headers: { 'Content-Type': 'text/xml' } },
        );
      }
      queryUrl = url;
      return new Response(
        JSON.stringify({
          done: true,
          records: [
            {
              Id: 'opportunity-1',
              Name: 'Local opportunity',
              Amount: 1200,
              StageName: 'Prospecting',
              IsClosed: false,
              IsWon: false,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const result = await provider.listDeals('access-token', {
      instanceUrl: 'https://single-currency.my.salesforce.com',
    });

    expect(new URL(queryUrl).searchParams.get('q')).not.toContain(
      'CurrencyIsoCode',
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ currency: 'BDT', amount: 1200 }),
    );
  });
});
