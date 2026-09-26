import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrganizationStatus } from '../enums/organization-status.enum';
import { Organization } from '../../database/schemas/organization.schema';
import { RequestUser } from '../types/request-context.type';

@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const organization = await this.organizations
      .findById(user.organizationId)
      .select('status')
      .lean()
      .exec();
    if (organization?.status === OrganizationStatus.SUSPENDED) {
      throw new ForbiddenException('This organization has been suspended');
    }

    request.organization = { id: user.organizationId };
    return true;
  }
}
