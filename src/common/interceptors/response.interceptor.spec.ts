import { CallHandler, ExecutionContext } from '@nestjs/common';
import { REDIRECT_METADATA } from '@nestjs/common/constants';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  function contextFor(handler: (...args: never[]) => unknown) {
    return {
      getHandler: () => handler,
    } as unknown as ExecutionContext;
  }

  function nextWith(value: unknown) {
    return { handle: () => of(value) } as CallHandler;
  }

  it('wraps regular API responses', async () => {
    const handler = () => undefined;

    await expect(
      firstValueFrom(
        interceptor.intercept(contextFor(handler), nextWith({ id: '1' })),
      ),
    ).resolves.toEqual({ success: true, data: { id: '1' } });
  });

  it('preserves dynamic redirect responses for Nest redirect handling', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(
      REDIRECT_METADATA,
      { url: '', statusCode: 302 },
      handler,
    );
    const redirect = {
      url: 'https://app.example.com/dashboard/integrations',
      statusCode: 302,
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(contextFor(handler), nextWith(redirect)),
      ),
    ).resolves.toEqual(redirect);
  });
});
