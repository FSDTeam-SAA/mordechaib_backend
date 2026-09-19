import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExecutiveBriefingType } from '../../common/enums/executive-briefing.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { GenerateExecutiveBriefingDto } from './dto/generate-executive-briefing.dto';
import { GetExecutiveBriefingQueryDto } from './dto/get-executive-briefing-query.dto';
import { ExecutiveBriefingsService } from './executive-briefings.service';

@ApiTags('Chief of Staff')
@ApiBearerAuth()
@Controller('chief-of-staff/briefings')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class ChiefOfStaffController {
  constructor(private readonly briefings: ExecutiveBriefingsService) {}

  @Post(':type/generate')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiParam({ name: 'type', enum: ExecutiveBriefingType })
  @ApiOperation({ summary: 'Queue an Executive Briefing generation job' })
  generate(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('type', new ParseEnumPipe(ExecutiveBriefingType))
    type: ExecutiveBriefingType,
    @Body() input: GenerateExecutiveBriefingDto,
  ) {
    return this.briefings.generate(organization.id, user.id, type, input);
  }

  @Get('id/:briefingId')
  @ApiOperation({ summary: 'Get one requester-scoped Executive Briefing' })
  getById(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('briefingId') briefingId: string,
  ) {
    return this.briefings.getById(
      organization.id,
      user.id,
      user.role,
      briefingId,
    );
  }

  @Get(':type')
  @ApiParam({ name: 'type', enum: ExecutiveBriefingType })
  @ApiOperation({ summary: 'Get the latest Executive Briefing for a period' })
  getLatest(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('type', new ParseEnumPipe(ExecutiveBriefingType))
    type: ExecutiveBriefingType,
    @Query() query: GetExecutiveBriefingQueryDto,
  ) {
    return this.briefings.getLatest(
      organization.id,
      user.id,
      user.role,
      type,
      query.asOf,
    );
  }
}
