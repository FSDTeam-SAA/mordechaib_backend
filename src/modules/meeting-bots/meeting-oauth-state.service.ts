import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { OAuthConnectionProvider } from '../../database/schemas/meeting-oauth-state.schema';
import { MeetingOAuthStateRepository } from './meeting-oauth-state.repository';

type OAuthStatePayload = {
  platform: OAuthConnectionProvider;
  organizationId: string;
  userId: string;
  issuedAt: number;
  nonce: string;
};

@Injectable()
export class MeetingOAuthStateService {
  private readonly lifetimeMs = 10 * 60 * 1000;

  constructor(
    private readonly repository: MeetingOAuthStateRepository,
    private readonly config: ConfigService,
  ) {}

  async create(
    platform: OAuthConnectionProvider,
    organizationId: string,
    userId: string,
  ) {
    const payload: OAuthStatePayload = {
      platform,
      organizationId,
      userId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(32).toString('base64url'),
    };
    await this.repository.create({
      nonceHash: this.hash(payload.nonce),
      platform,
      organizationId,
      userId,
      expiresAt: new Date(payload.issuedAt + this.lifetimeMs),
    });
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  async consume(value: string, expectedPlatform: OAuthConnectionProvider) {
    const [encoded, signature] = value.split('.');
    const expected = this.sign(encoded || '');
    if (
      !encoded ||
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid meeting OAuth state');
    }

    let payload: OAuthStatePayload;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as OAuthStatePayload;
    } catch {
      throw new UnauthorizedException('Invalid meeting OAuth state');
    }
    const now = new Date();
    if (
      payload.platform !== expectedPlatform ||
      !payload.organizationId ||
      !payload.userId ||
      !payload.nonce ||
      now.getTime() - payload.issuedAt > this.lifetimeMs ||
      payload.issuedAt > now.getTime() + 30_000
    ) {
      throw new UnauthorizedException('Meeting OAuth state has expired');
    }
    const consumed = await this.repository.consume({
      nonceHash: this.hash(payload.nonce),
      platform: expectedPlatform,
      organizationId: payload.organizationId,
      userId: payload.userId,
      now,
    });
    if (!consumed) {
      throw new UnauthorizedException(
        'Meeting OAuth state is expired or has already been used',
      );
    }
    return payload;
  }

  callbackUrl(
    platform: OAuthConnectionProvider,
    connected: boolean,
    error?: string,
  ) {
    const url = new URL(
      this.config.get<string>(
        'meetingPlatforms.frontendIntegrationsUrl',
        'http://localhost:3000/dashboard/integrations',
      ),
    );
    url.searchParams.set(
      'provider',
      platform === MeetingPlatform.ZOOM
        ? 'zoom'
        : platform === CalendarProviderType.OUTLOOK_CALENDAR
          ? 'outlook-calendar'
          : 'google-meet',
    );
    url.searchParams.set('connection', connected ? 'success' : 'failed');
    if (error) url.searchParams.set('error', error.slice(0, 120));
    return url.toString();
  }

  private sign(value: string) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(value)
      .digest('base64url');
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private get secret() {
    return this.config.getOrThrow<string>('meetingPlatforms.oauthStateSecret');
  }
}
