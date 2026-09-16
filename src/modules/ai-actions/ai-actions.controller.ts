import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { AiActionsService } from './ai-actions.service';
import {
  AiProposalCommand,
  ExecuteAiActionProposalDto,
} from './dto/execute-ai-action-proposal.dto';
import { ListAiActionProposalsQueryDto } from './dto/list-ai-action-proposals-query.dto';
import {
  ActionCenterParamsDto,
  GetActionCenterQueryDto,
} from './dto/get-action-center-query.dto';

@ApiTags('AI Action Center')
@ApiBearerAuth()
@Controller(['ai-actions/sources', 'call-intelligence'])
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class SourceActionCenterController {
  constructor(private readonly service: AiActionsService) {}

  @Get(':sourceId/action-center')
  @ApiOperation({
    summary: 'Get source-specific priority task and meeting proposals',
    description:
      'Returns UI-ready proposal lists, clarification questions, and submitted clarification answers. Proposal commands remain on the AI action proposal endpoint.',
  })
  getActionCenter(
    @CurrentOrg() organization: RequestOrganization,
    @Param() params: ActionCenterParamsDto,
    @Query() query: GetActionCenterQueryDto,
  ) {
    return this.service.getActionCenter(
      organization.id,
      params.sourceId,
      query,
    );
  }
}

@ApiTags('AI Action Proposals')
@ApiBearerAuth()
@Controller('ai-actions/proposals')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AiActionsController {
  constructor(private readonly service: AiActionsService) {}

  @Get()
  @ApiOperation({ summary: 'List organization AI action proposals' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListAiActionProposalsQueryDto,
  ) {
    return this.service.list(organization.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an AI action proposal' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.service.get(organization.id, id);
  }

  @Post(':id/action')
  @ApiOperation({
    summary: 'Approve, reject, or retry an AI action proposal',
    description:
      'Use APPROVE to execute a pending proposal, REJECT with a reason to reject it, or RETRY to retry a failed execution.',
  })
  executeAction(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ExecuteAiActionProposalDto,
  ) {
    switch (dto.action) {
      case AiProposalCommand.APPROVE:
        return this.service.approve(organization.id, user, id);
      case AiProposalCommand.REJECT:
        return this.service.reject(organization.id, user, id, dto.reason!);
      case AiProposalCommand.RETRY:
        return this.service.retry(organization.id, user, id);
    }
  }
}
