import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { PlatformSettingsService } from '../../modules/settings/platform-settings.service';
import { MaintenanceModeGuard } from './maintenance-mode.guard';

describe('MaintenanceModeGuard', () => {
  const settings = { isMaintenanceModeEnabled: jest.fn() };
  let guard: MaintenanceModeGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new MaintenanceModeGuard(
      settings as unknown as PlatformSettingsService,
    );
  });

  const context = (path: string, user?: { isPlatformAdmin?: boolean }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ path, user }) }),
    }) as unknown as ExecutionContext;

  it('allows all requests when maintenance mode is disabled', async () => {
    settings.isMaintenanceModeEnabled.mockResolvedValue(false);
    await expect(guard.canActivate(context('/api/v1/tasks'))).resolves.toBe(
      true,
    );
  });

  it('blocks customer traffic while maintenance mode is enabled', async () => {
    settings.isMaintenanceModeEnabled.mockResolvedValue(true);
    await expect(
      guard.canActivate(context('/api/v1/tasks')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('allows platform administrators during maintenance', async () => {
    settings.isMaintenanceModeEnabled.mockResolvedValue(true);
    await expect(
      guard.canActivate(context('/api/v1/tasks', { isPlatformAdmin: true })),
    ).resolves.toBe(true);
  });

  it.each([
    '/api/v1/auth/login',
    '/api/v1/health',
    '/api/v1/webhooks/stripe',
    '/api/v1/platform/settings',
    '/api/docs',
  ])('keeps recovery path %s available', async (path) => {
    settings.isMaintenanceModeEnabled.mockResolvedValue(true);
    await expect(guard.canActivate(context(path))).resolves.toBe(true);
  });
});
