import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProvider } from '../../common/enums/email-provider.enum';

export type EmailTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export type EmailAccountProfile = { id: string; email: string };

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly definitelyNotSent: boolean,
  ) {
    super(message);
  }
}

@Injectable()
export class EmailProviderClient {
  constructor(private readonly config: ConfigService) {}

  authorizationUrl(provider: EmailProvider, state: string) {
    this.clientSecret(provider);
    const url = new URL(
      provider === EmailProvider.GOOGLE
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : `${this.microsoftAuthority}/oauth2/v2.0/authorize`,
    );
    url.search = new URLSearchParams({
      client_id: this.clientId(provider),
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      state,
      scope: this.scopes(provider),
      ...(provider === EmailProvider.GOOGLE
        ? { access_type: 'offline', prompt: 'consent select_account' }
        : { response_mode: 'query', prompt: 'select_account' }),
    }).toString();
    return url.toString();
  }

  exchangeCode(provider: EmailProvider, code: string) {
    return this.tokenRequest(provider, {
      client_id: this.clientId(provider),
      client_secret: this.clientSecret(provider),
      redirect_uri: this.redirectUri(provider),
      grant_type: 'authorization_code',
      code,
      ...(provider === EmailProvider.OUTLOOK
        ? { scope: this.scopes(provider) }
        : {}),
    });
  }

  refreshToken(provider: EmailProvider, refreshToken: string) {
    return this.tokenRequest(provider, {
      client_id: this.clientId(provider),
      client_secret: this.clientSecret(provider),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...(provider === EmailProvider.OUTLOOK
        ? { scope: this.scopes(provider) }
        : {}),
    });
  }

  async profile(
    provider: EmailProvider,
    accessToken: string,
  ): Promise<EmailAccountProfile> {
    const response = await this.authorizedRequest(
      provider === EmailProvider.GOOGLE
        ? 'https://openidconnect.googleapis.com/v1/userinfo'
        : 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',
      accessToken,
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (provider === EmailProvider.GOOGLE && body.email_verified !== true) {
      throw new BadGatewayException('Google account email is not verified');
    }
    const id = body.sub || body.id;
    const email = body.email || body.mail || body.userPrincipalName;
    if (typeof id !== 'string' || typeof email !== 'string' || !email) {
      throw new BadGatewayException('Email provider profile is incomplete');
    }
    return { id, email };
  }

  async send(
    provider: EmailProvider,
    accessToken: string,
    input: { from: string; to: string[]; subject: string; body: string },
  ): Promise<{ providerMessageId?: string }> {
    const url =
      provider === EmailProvider.GOOGLE
        ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
        : 'https://graph.microsoft.com/v1.0/me/sendMail';
    const body =
      provider === EmailProvider.GOOGLE
        ? { raw: this.gmailMessage(input) }
        : {
            message: {
              subject: input.subject,
              body: { contentType: 'Text', content: input.body },
              toRecipients: input.to.map((address) => ({
                emailAddress: { address },
              })),
            },
            saveToSentItems: true,
          };
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new EmailSendError(
        'Email provider response is unknown; check Sent Items before retrying',
        false,
      );
    }
    if (!response.ok) {
      throw new EmailSendError(
        `Email provider rejected the send request (HTTP ${response.status})`,
        response.status >= 400 && response.status < 500,
      );
    }
    if (provider === EmailProvider.OUTLOOK) {
      if (response.status !== 202) {
        throw new EmailSendError(
          'Outlook returned an unexpected send acknowledgement',
          false,
        );
      }
      return {};
    }
    const result = (await response.json().catch(() => ({}))) as { id?: string };
    if (!result.id) {
      throw new EmailSendError(
        'Gmail accepted the message without a confirmation id',
        false,
      );
    }
    return { providerMessageId: result.id };
  }

  private gmailMessage(input: {
    from: string;
    to: string[];
    subject: string;
    body: string;
  }) {
    const encodedSubject = this.encodeHeader(input.subject);
    const encodedBody =
      Buffer.from(input.body, 'utf8')
        .toString('base64')
        .match(/.{1,76}/g)
        ?.join('\r\n') || '';
    const mime = [
      `From: ${input.from}`,
      `To: ${input.to.join(',\r\n ')}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodedBody,
    ].join('\r\n');
    return Buffer.from(mime, 'utf8').toString('base64url');
  }

  private encodeHeader(value: string) {
    const parts: string[] = [];
    let chunk = '';
    for (const character of value) {
      if (Buffer.byteLength(chunk + character, 'utf8') > 45 && chunk) {
        parts.push(`=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`);
        chunk = '';
      }
      chunk += character;
    }
    if (chunk)
      parts.push(`=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`);
    return parts.join('\r\n ');
  }

  private async tokenRequest(
    provider: EmailProvider,
    parameters: Record<string, string>,
  ): Promise<EmailTokens> {
    const url =
      provider === EmailProvider.GOOGLE
        ? 'https://oauth2.googleapis.com/token'
        : `${this.microsoftAuthority}/oauth2/v2.0/token`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ServiceUnavailableException('Email OAuth is unavailable');
    }
    const result = (await response
      .json()
      .catch(() => ({}))) as Partial<EmailTokens>;
    if (!response.ok || !result.access_token) {
      throw new BadGatewayException('Email OAuth token exchange failed');
    }
    return result as EmailTokens;
  }

  private async authorizedRequest(url: string, accessToken: string) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ServiceUnavailableException('Email profile is unavailable');
    }
    if (!response.ok) {
      throw new BadGatewayException('Email provider profile lookup failed');
    }
    return response;
  }

  private scopes(provider: EmailProvider) {
    return provider === EmailProvider.GOOGLE
      ? 'openid email profile https://www.googleapis.com/auth/gmail.send'
      : 'openid profile email offline_access User.Read Mail.Send';
  }

  private clientId(provider: EmailProvider) {
    return this.required(
      provider === EmailProvider.GOOGLE
        ? 'email.google.clientId'
        : 'email.microsoft.clientId',
    );
  }

  private clientSecret(provider: EmailProvider) {
    return this.required(
      provider === EmailProvider.GOOGLE
        ? 'email.google.clientSecret'
        : 'email.microsoft.clientSecret',
    );
  }

  private redirectUri(provider: EmailProvider) {
    return this.required(
      provider === EmailProvider.GOOGLE
        ? 'email.google.redirectUri'
        : 'email.microsoft.redirectUri',
    );
  }

  private get microsoftAuthority() {
    return this.config.get<string>(
      'email.microsoft.authority',
      'https://login.microsoftonline.com/common',
    );
  }

  private required(key: string) {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new ServiceUnavailableException('Email OAuth is not configured');
    }
    return value;
  }
}
