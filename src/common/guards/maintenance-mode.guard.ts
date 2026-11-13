import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { PlatformSettingsService } from '../../modules/settings/platform-settings.service';

const RECOVERY_PATHS = [
  '/health',
  '/auth/',
  '/webhooks/',
  '/platform/settings',
  '/platform/system-services',
  '/api/docs',
] as const;

@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  constructor(private readonly settings: PlatformSettingsService) {}

  async canActivate(context: ExecutionContext) {
    if (!(await this.settings.isMaintenanceModeEnabled())) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { isPlatformAdmin?: boolean } }>();
    if (request.user?.isPlatformAdmin || this.isRecoveryPath(request.path)) {
      return true;
    }
    throw new ServiceUnavailableException({
      code: 'PLATFORM_MAINTENANCE_MODE',
      message:
        'The platform is temporarily unavailable for scheduled maintenance.',
    });
  }

  private isRecoveryPath(path: string) {
    return RECOVERY_PATHS.some((allowed) => path.includes(allowed));
  }
}
