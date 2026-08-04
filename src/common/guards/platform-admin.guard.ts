import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestUser } from '../types/request-context.type';

/**
 * Restricts a route to platform-level admins (Noltra staff who manage the
 * subscription-plan catalog), as opposed to OrganizationGuard/RolesGuard
 * which scope a user to their own organization. A user's organizationId is
 * irrelevant here — only `isPlatformAdmin` on their account matters.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user) throw new UnauthorizedException('Authentication is required');

    if (!user.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin access is required');
    }

    return true;
  }
}
