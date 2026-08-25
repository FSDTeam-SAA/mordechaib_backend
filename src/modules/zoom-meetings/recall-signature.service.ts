import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';

type RecallHeaders = Record<string, string | string[] | undefined>;

@Injectable()
export class RecallSignatureService {
  constructor(private readonly config: ConfigService) {}

  verify(headers: RecallHeaders, rawPayload: Buffer | null) {
    const secret = this.config.get<string>('recall.webhookSecret');
    if (!secret?.startsWith('whsec_')) {
      throw new ServiceUnavailableException(
        'Recall webhook verification is not configured',
      );
    }

    const messageId = this.header(headers, 'webhook-id', 'svix-id');
    const timestamp = this.header(
      headers,
      'webhook-timestamp',
      'svix-timestamp',
    );
    const signature = this.header(
      headers,
      'webhook-signature',
      'svix-signature',
    );
    if (!messageId || !timestamp || !signature) {
      throw new UnauthorizedException('Missing Recall webhook signature');
    }

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60
    ) {
      throw new UnauthorizedException('Recall webhook timestamp is invalid');
    }

    const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
    const signedContent = `${messageId}.${timestamp}.${rawPayload?.toString('utf8') ?? ''}`;
    const expected = crypto
      .createHmac('sha256', key)
      .update(signedContent)
      .digest();

    const valid = signature.split(' ').some((item) => {
      const [version, encoded] = item.split(',');
      if (version !== 'v1' || !encoded) return false;
      try {
        const received = Buffer.from(encoded, 'base64');
        return (
          received.length === expected.length &&
          crypto.timingSafeEqual(received, expected)
        );
      } catch {
        return false;
      }
    });
    if (!valid) {
      throw new UnauthorizedException('Invalid Recall webhook signature');
    }
    return { messageId };
  }

  private header(headers: RecallHeaders, ...names: string[]) {
    for (const name of names) {
      const value = headers[name];
      if (Array.isArray(value) && value[0]) return value[0];
      if (typeof value === 'string') return value;
    }
    return undefined;
  }
}
