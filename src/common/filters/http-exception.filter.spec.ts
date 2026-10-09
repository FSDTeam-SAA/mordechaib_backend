import { ArgumentsHost, ServiceUnavailableException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('preserves safe structured exception metadata', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'POST',
          path: '/api/v1/calendar/sync',
        }),
      }),
    } as unknown as ArgumentsHost;
    const providers = [
      {
        provider: 'GOOGLE_CALENDAR',
        status: 'FAILED',
        synchronized: 0,
        error: 'The GOOGLE_CALENDAR connection must be reauthorized',
      },
    ];

    new HttpExceptionFilter().catch(
      new ServiceUnavailableException({
        message: 'No connected calendar could be synchronized',
        providers,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 503,
        message: 'No connected calendar could be synchronized',
        providers,
      }),
    );
  });
});
