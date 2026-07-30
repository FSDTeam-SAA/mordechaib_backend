import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';
import { CallsService } from './calls.service';

@Controller('calls')
@UseGuards(OrganizationGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('outbound')
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
