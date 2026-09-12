import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiServiceSecretGuard } from './ai-service-secret.guard';

describe('AiServiceSecretGuard', () => {
  const context = (secret?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: secret ? { 'x-ai-actions-secret': secret } : {},
        }),
      }),
    }) as unknown as ExecutionContext;

  it('accepts the configured shared secret', () => {
    const guard = new AiServiceSecretGuard({
      get: () => 'shared-secret',
    } as unknown as ConfigService);

    expect(guard.canActivate(context('shared-secret'))).toBe(true);
  });

  it('rejects missing or incorrect credentials', () => {
    const guard = new AiServiceSecretGuard({
      get: () => 'shared-secret',
    } as unknown as ConfigService);

    expect(() => guard.canActivate(context('wrong-secret'))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('fails closed when the server secret is not configured', () => {
    const guard = new AiServiceSecretGuard({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(() => guard.canActivate(context('any-secret'))).toThrow(
      ServiceUnavailableException,
    );
  });
});
