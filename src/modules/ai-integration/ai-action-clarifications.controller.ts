import {
  Body,
  Controller,
  Header,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { AnswerAiClarificationDto } from '../ai-actions/dto/answer-ai-clarification.dto';
import { AiActionClarificationWorkflowService } from './ai-action-clarification-workflow.service';

@ApiTags('AI Action Proposals')
@ApiExcludeController()
@ApiBearerAuth()
@Controller('ai-actions/proposals')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AiActionClarificationsController {
  constructor(
    private readonly workflow: AiActionClarificationWorkflowService,
  ) {}

  @Post(':id/clarifications')
  @Header('Deprecation', 'true')
  @ApiOperation({
    summary: 'Save a CEO clarification answer and request a revised AI draft',
  })
  async answer(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: AnswerAiClarificationDto,
  ) {
    return this.workflow.submitAnswer({
      organizationId: organization.id,
      proposalId: id,
      questionId: input.questionId,
      answer: input.answer,
    });
  }
}
