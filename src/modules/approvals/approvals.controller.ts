import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ApprovalsService } from './approvals.service';

@Controller('approvals')
@UseGuards(OrganizationGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  create(@CurrentOrg() org: { id: string }, @Body() dto: CreateApprovalDto) {
    return this.approvalsService.createApproval({
      organizationId: org.id,
      ...dto,
    });
  }

  @Get()
  findPending(@CurrentOrg() org: { id: string }) {
    return this.approvalsService.findByOrganization(org.id);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.approvalsService.approve(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.approvalsService.reject(id);
  }
}
