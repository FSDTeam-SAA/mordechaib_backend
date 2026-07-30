import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(OrganizationGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll(@CurrentOrg() organization: RequestOrganization) {
    return this.service.findByOrganization(organization.id);
  }
}
