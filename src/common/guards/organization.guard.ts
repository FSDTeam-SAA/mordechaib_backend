import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestUser } from '../types/request-context.type';

@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user) throw new UnauthorizedException('Authentication is required');

    const requestedOrganizationId = request.headers['x-organization-id'];
    if (
      requestedOrganizationId &&
      requestedOrganizationId !== user.organizationId
    ) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }

    request.organization = { id: user.organizationId };
    return true;
  }
}
