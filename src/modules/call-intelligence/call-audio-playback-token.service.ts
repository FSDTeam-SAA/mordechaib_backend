import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';

type PlaybackTokenPayload = {
  version: 1;
  organizationId: string;
  sourceId: string;
  sourceType:
    AiProposalSourceType.CALL_AUDIO | AiProposalSourceType.CALL_TRANSCRIPT;
  expiresAt: number;
};

@Injectable()
export class CallAudioPlaybackTokenService {
  constructor(private readonly config: ConfigService) {}

  issue(input: Omit<PlaybackTokenPayload, 'version' | 'expiresAt'>) {
    const expiresAt =
      Math.floor(Date.now() / 1_000) +
      this.config.get<number>('callIntelligence.audioPlaybackTtlSeconds', 300);
    const encodedPayload = Buffer.from(
      JSON.stringify({ version: 1, ...input, expiresAt }),
      'utf8',
    ).toString('base64url');
    return {
      token: `${encodedPayload}.${this.sign(encodedPayload)}`,
      expiresAt: new Date(expiresAt * 1_000),
    };
  }

  verify(token: string): PlaybackTokenPayload {
    const [encodedPayload, providedSignature, extra] = token.split('.');
    if (!encodedPayload || !providedSignature || extra) {
      throw new UnauthorizedException('Invalid audio playback token');
    }
    const expectedSignature = this.sign(encodedPayload);
    const provided = Buffer.from(providedSignature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');
    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      throw new UnauthorizedException('Invalid audio playback token');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as unknown;
    } catch {
      throw new UnauthorizedException('Invalid audio playback token');
    }
    if (!this.isPayload(payload)) {
      throw new UnauthorizedException('Invalid audio playback token');
    }
    if (payload.expiresAt <= Math.floor(Date.now() / 1_000)) {
      throw new UnauthorizedException('Audio playback token has expired');
    }
    return payload;
  }

  private isPayload(value: unknown): value is PlaybackTokenPayload {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    return (
      payload.version === 1 &&
      typeof payload.organizationId === 'string' &&
      payload.organizationId.length > 0 &&
      typeof payload.sourceId === 'string' &&
      /^[a-f\d]{24}$/i.test(payload.sourceId) &&
      [
        AiProposalSourceType.CALL_AUDIO,
        AiProposalSourceType.CALL_TRANSCRIPT,
      ].includes(payload.sourceType as AiProposalSourceType) &&
      typeof payload.expiresAt === 'number' &&
      Number.isSafeInteger(payload.expiresAt)
    );
  }

  private sign(encodedPayload: string) {
    const secret = this.config.get<string>(
      'callIntelligence.audioPlaybackSecret',
    );
    if (!secret) {
      throw new ServiceUnavailableException('Audio playback is not configured');
    }
    return crypto
      .createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');
  }
}
