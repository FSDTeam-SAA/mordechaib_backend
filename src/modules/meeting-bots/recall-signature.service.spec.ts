import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import crypto from 'crypto';
import { RecallSignatureService } from './recall-signature.service';

describe('RecallSignatureService', () => {
  const secretBytes = Buffer.from('test-recall-webhook-secret');
  const secret = `whsec_${secretBytes.toString('base64')}`;
  const service = new RecallSignatureService({
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService);

  it('accepts a correctly signed raw payload', () => {
    const messageId = 'event-1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = Buffer.from('{"event":"bot.done"}');
    const signature = crypto
      .createHmac('sha256', secretBytes)
      .update(`${messageId}.${timestamp}.${payload.toString('utf8')}`)
      .digest('base64');

    expect(
      service.verify(
        {
          'webhook-id': messageId,
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${signature}`,
        },
        payload,
      ),
    ).toEqual({ messageId });
  });

  it('rejects a tampered raw payload', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(() =>
      service.verify(
        {
          'webhook-id': 'event-1',
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${Buffer.alloc(32).toString('base64')}`,
        },
        Buffer.from('{"event":"bot.done"}'),
      ),
    ).toThrow(UnauthorizedException);
  });
});
