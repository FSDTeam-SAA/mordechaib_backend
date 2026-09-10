import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AnswerAiClarificationDto } from '../ai-actions/dto/answer-ai-clarification.dto';
import { AiJobsQueue } from './ai-jobs.queue';

@ApiTags('AI Action Proposals')
@ApiBearerAuth()
@Controller('ai-actions/proposals')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AiActionClarificationsController {
  constructor(
    private readonly actions: AiActionsService,
    private readonly jobs: AiJobsQueue,
  ) {}

  @Post(':id/clarifications')
  @ApiOperation({
    summary: 'Save a CEO clarification answer and request a revised AI draft',
  })
  async answer(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: AnswerAiClarificationDto,
  ) {
    const proposal = await this.actions.answerClarification(
      organization.id,
      id,
      input.questionId,
      input.answer,
    );
    await this.jobs.enqueueActionRefinement({
      organizationId: organization.id,
      proposalId: id,
      questionId: input.questionId,
      answer: input.answer,
    });
    return proposal;
  }
}
