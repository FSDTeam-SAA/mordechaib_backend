import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { UpdateBusinessSizeDto } from './dto/update-business-size.dto';
import { UpdateCompanyDetailsDto } from './dto/update-company-details.dto';
import { UpdateIndustryDto } from './dto/update-industry.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(OrganizationGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  findCurrent(@CurrentOrg() organization: RequestOrganization) {
    return this.service.findCurrent(organization.id);
  }

  @Patch('onboarding/company-details')
  updateCompanyDetails(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: UpdateCompanyDetailsDto,
  ) {
    return this.service.updateCompanyDetails(organization.id, dto);
  }

  @Patch('onboarding/industry')
  updateIndustry(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: UpdateIndustryDto,
  ) {
    return this.service.updateIndustry(organization.id, dto.industry);
  }

  @Patch('onboarding/business-size')
  updateBusinessSize(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: UpdateBusinessSizeDto,
  ) {
    return this.service.updateBusinessSize(organization.id, dto.businessSize);
  }
}
