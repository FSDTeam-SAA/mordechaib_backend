import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { MetaService } from './meta.service';

@ApiTags('Meta')
@ApiBearerAuth()
@Controller('meta')
export class MetaController {
  constructor(private readonly service: MetaService) {}

  @Get('connect')
  @UseGuards(OrganizationGuard)
  connect(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createAuthorizationUrl(organization.id, user.id);
  }

  @Public()
  @Get('callback')
  callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    if (error) return { connected: false, error };
    if (!code || !state)
      throw new BadRequestException('Meta OAuth code and state are required');
    return this.service.completeAuthorization(code, state);
  }

  @Get('connection')
  @UseGuards(OrganizationGuard)
  connection(@CurrentOrg() organization: RequestOrganization) {
    return this.service.getConnection(organization.id);
  }
}
