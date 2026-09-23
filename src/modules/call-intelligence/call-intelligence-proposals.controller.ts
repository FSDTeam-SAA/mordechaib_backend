import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { AnswerAiClarificationDto } from '../ai-actions/dto/answer-ai-clarification.dto';
import { ListAiActionProposalsQueryDto } from '../ai-actions/dto/list-ai-action-proposals-query.dto';
import { CallIntelligenceProposalsFacade } from './call-intelligence-proposals.facade';
import { ExecuteCallIntelligenceProposalDto } from './dto/execute-call-intelligence-proposal.dto';

@ApiTags('Call Intelligence')
@ApiBearerAuth()
@Controller('call-intelligence/proposals')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class CallIntelligenceProposalsController {
  constructor(private readonly proposals: CallIntelligenceProposalsFacade) {}

  @Get()
  @ApiOperation({ summary: 'List organization AI action proposals' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListAiActionProposalsQueryDto,
  ) {
    return this.proposals.list(organization.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an AI action proposal' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.proposals.get(organization.id, id);
  }

  @Post(':id/clarifications')
  @ApiOperation({
    summary: 'Answer one clarification question and request an AI revision',
    description:
      'Saves the answer, moves the proposal to ANALYZING, and queues the existing AI refinement workflow.',
  })
  answerClarification(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: AnswerAiClarificationDto,
  ) {
    return this.proposals.answerClarification(organization.id, id, input);
  }

  @Post(':id/action')
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: { action: { type: 'string', enum: ['APPROVE'] } },
          example: { action: 'APPROVE' },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'reason'],
          properties: {
            action: { type: 'string', enum: ['REJECT'] },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
          },
          example: {
            action: 'REJECT',
            reason: 'The proposed time does not work.',
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: { action: { type: 'string', enum: ['RETRY'] } },
          example: { action: 'RETRY' },
        },
      ],
    },
  })
  @ApiOperation({
    summary: 'Approve, reject, or retry an AI action proposal',
    description:
      'Clarification answers use POST /call-intelligence/proposals/:id/clarifications.',
  })
  execute(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() command: ExecuteCallIntelligenceProposalDto,
  ) {
    return this.proposals.execute(organization.id, user, id, command);
  }
}
