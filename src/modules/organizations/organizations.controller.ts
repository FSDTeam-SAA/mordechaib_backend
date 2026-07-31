import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get(':organizationId')
  findOne(@Param('organizationId') organizationId: string) {
    return this.service.findCurrent(organizationId);
  }

  @Public()
  @Patch('onboarding/:organizationId')
  @ApiParam({ name: 'organizationId', required: true })
  updateOnboarding(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.service.updateOnboarding(organizationId, dto);
  }
}