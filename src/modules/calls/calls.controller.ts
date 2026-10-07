import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';
import { CallsService } from './calls.service';

@ApiTags('Calls')
@ApiBearerAuth()
@Controller('calls')
@UseGuards(OrganizationGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('outbound')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createOutboundCall(
    @CurrentOrg() org: { id: string },
    @Body() dto: CreateOutboundCallDto,
  ) {
    return this.callsService.createOutboundCall(org.id, dto);
  }

  @Get()
  findOrganizationCalls(@CurrentOrg() org: { id: string }) {
    return this.callsService.findOrganizationCalls(org.id);
  }
}
