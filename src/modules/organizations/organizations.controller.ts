import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(OrganizationGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get('me')
  findMe(@CurrentOrg() organization: RequestOrganization) {
    return this.service.findCurrent(organization.id);
  }

  @Get(':organizationId')
  findOne(
    @Param('organizationId') organizationId: string,
    @CurrentOrg() organization: RequestOrganization,
  ) {
    this.assertOrganization(organizationId, organization.id);
    return this.service.findCurrent(organization.id);
  }

  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateMe(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.service.updateSettings(organization.id, dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch('onboarding/:organizationId')
  @ApiParam({ name: 'organizationId', required: true })
  updateOnboarding(
    @Param('organizationId') organizationId: string,
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateOnboardingDto,
  ) {
    this.assertOrganization(organizationId, organization.id);
    return this.service.updateOnboarding(organization.id, dto, user.id);
  }

  private assertOrganization(requestedId: string, currentId: string) {
    if (requestedId !== currentId) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }
  }
}
