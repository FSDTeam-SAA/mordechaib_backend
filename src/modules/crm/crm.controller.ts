import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CrmProviderType } from '../../common/types/crm-provider.interface';
import { RequestUser } from '../../common/types/request-context.type';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CreateCrmContactDto } from './dto/create-crm-contact.dto';
import { CreateCrmDealDto } from './dto/create-crm-deal.dto';
import { CrmRevenueQueryDto } from './dto/crm-revenue-query.dto';
import { UpdateCrmDealDto } from './dto/update-crm-deal.dto';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmService } from './crm.service';

@ApiTags('CRM')
@ApiBearerAuth()
@Controller('crm')
@UseGuards(OrganizationGuard)
export class CrmController {
  constructor(
    private readonly crmService: CrmService,
    private readonly analytics: CrmAnalyticsService,
    private readonly providers: CrmProviderRegistry,
  ) {}

  @Get('analytics/revenue')
  revenue(
    @CurrentOrg() org: { id: string },
    @Query() query: CrmRevenueQueryDto,
  ) {
    return this.analytics.revenue({
      organizationId: org.id,
      provider: query.provider ? this.crmProvider(query.provider) : undefined,
      groupBy: query.groupBy,
      from: query.from,
      to: query.to,
    });
  }

  @Post('contacts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createContact(
    @CurrentOrg() org: { id: string },
    @Body() dto: CreateCrmContactDto,
  ) {
    return this.crmService.createContact(org.id, dto);
  }

  @Post(':provider/deals')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createDeal(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
    @Body() dto: CreateCrmDealDto,
  ) {
    return this.crmService.createDeal(
      org.id,
      user.id,
      this.crmProvider(provider),
      {
        ...dto,
        currency: dto.currency?.toUpperCase(),
        closeDate: dto.closeDate ? new Date(dto.closeDate) : undefined,
      },
    );
  }

  @Patch(':provider/deals/:externalId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateDeal(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
    @Param('externalId') externalId: string,
    @Body() dto: UpdateCrmDealDto,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one update field is required');
    }
    return this.crmService.updateDeal(
      org.id,
      user.id,
      this.crmProvider(provider),
      externalId,
      {
        ...dto,
        currency: dto.currency?.toUpperCase(),
        closeDate: dto.closeDate ? new Date(dto.closeDate) : undefined,
      },
    );
  }

  private crmProvider(provider: string): CrmProviderType {
    if (!this.providers.isCrmProvider(provider)) {
      throw new BadRequestException('provider must be HUBSPOT or SALESFORCE');
    }
    return provider;
  }
}
