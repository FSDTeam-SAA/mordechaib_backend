import { ConfigService } from '@nestjs/config';
import { EmailProvider } from '../../common/enums/email-provider.enum';
import { EmailProviderClient, EmailSendError } from './email-provider.client';

describe('EmailProviderClient', () => {
  const config = {
    get: jest.fn(
      (key: string, fallback?: string) =>
        ({
          'email.google.clientId': 'google-client',
          'email.google.clientSecret': 'google-secret',
          'email.google.redirectUri':
            'https://api.example/api/v1/email/connections/GOOGLE/callback',
          'email.microsoft.clientId': 'microsoft-client',
          'email.microsoft.clientSecret': 'microsoft-secret',
          'email.microsoft.redirectUri':
            'https://api.example/api/v1/email/connections/OUTLOOK/callback',
        })[key] || fallback,
    ),
  } as unknown as ConfigService;
  const client = new EmailProviderClient(config);

  afterEach(() => jest.restoreAllMocks());

  it('requests only send permission when connecting either provider', () => {
    const google = new URL(
      client.authorizationUrl(EmailProvider.GOOGLE, 'state-1'),
    );
    const outlook = new URL(
      client.authorizationUrl(EmailProvider.OUTLOOK, 'state-2'),
    );

    expect(google.searchParams.get('scope')).toContain('gmail.send');
    expect(google.searchParams.get('access_type')).toBe('offline');
    expect(outlook.searchParams.get('scope')).toContain('Mail.Send');
    expect(outlook.searchParams.get('scope')).toContain('offline_access');
    expect(outlook.searchParams.get('scope')).not.toContain('Mail.Read');
  });

  it('sends a Gmail MIME message with reviewed text and returns its message id', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: 'gmail-message-1' }),
    } as unknown as Response);

    await expect(
      client.send(EmailProvider.GOOGLE, 'access-token', {
        from: 'owner@example.com',
        to: ['client@example.com'],
        subject: 'Project quotation',
        body: 'Here is your quotation.',
      }),
    ).resolves.toEqual({ providerMessageId: 'gmail-message-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    );
    const request = JSON.parse(String(init?.body)) as { raw: string };
    const mime = Buffer.from(request.raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: owner@example.com');
    expect(mime).toContain('To: client@example.com');
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain(
      Buffer.from('Here is your quotation.').toString('base64'),
    );
  });

  it('uses Microsoft Graph delegated sendMail and treats 202 as accepted', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 202,
    } as Response);

    await expect(
      client.send(EmailProvider.OUTLOOK, 'access-token', {
        from: 'owner@example.com',
        to: ['client@example.com'],
        subject: 'Project quotation',
        body: 'Here is your quotation.',
      }),
    ).resolves.toEqual({});

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(JSON.parse(String(init?.body))).toEqual({
      message: {
        subject: 'Project quotation',
        body: { contentType: 'Text', content: 'Here is your quotation.' },
        toRecipients: [{ emailAddress: { address: 'client@example.com' } }],
      },
      saveToSentItems: true,
    });
  });

  it('marks a lost provider response as uncertain', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    await expect(
      client.send(EmailProvider.GOOGLE, 'access-token', {
        from: 'owner@example.com',
        to: ['client@example.com'],
        subject: 'Quotation',
        body: 'Please review.',
      }),
    ).rejects.toMatchObject<Partial<EmailSendError>>({
      definitelyNotSent: false,
    });
  });
});
