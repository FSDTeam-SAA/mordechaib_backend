import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { IntegrationsService } from './integrations.service';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
@UseGuards(OrganizationGuard)
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  findAll(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.findAll(organization.id, user.id);
  }
}
