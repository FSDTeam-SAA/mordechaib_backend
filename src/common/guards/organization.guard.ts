import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.headers['x-organization-id'];

    if (!organizationId) {
      throw new BadRequestException('Missing x-organization-id header');
    }

    request.organization = { id: organizationId };
    return true;
  }
}
