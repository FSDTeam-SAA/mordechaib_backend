import { Injectable } from '@nestjs/common';
import { RequestUser } from '../../common/types/request-context.type';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AnswerAiClarificationDto } from '../ai-actions/dto/answer-ai-clarification.dto';
import { ListAiActionProposalsQueryDto } from '../ai-actions/dto/list-ai-action-proposals-query.dto';
import { AiActionClarificationWorkflowService } from '../ai-integration/ai-action-clarification-workflow.service';
import {
  CallIntelligenceProposalCommand,
  ExecuteCallIntelligenceProposalDto,
} from './dto/execute-call-intelligence-proposal.dto';

@Injectable()
export class CallIntelligenceProposalsFacade {
  constructor(
    private readonly actions: AiActionsService,
    private readonly clarifications: AiActionClarificationWorkflowService,
  ) {}

  list(organizationId: string, query: ListAiActionProposalsQueryDto) {
    return this.actions.list(organizationId, query);
  }

  get(organizationId: string, proposalId: string) {
    return this.actions.get(organizationId, proposalId);
  }

  answerClarification(
    organizationId: string,
    proposalId: string,
    input: AnswerAiClarificationDto,
  ) {
    return this.clarifications.submitAnswer({
      organizationId,
      proposalId,
      questionId: input.questionId,
      answer: input.answer,
    });
  }

  execute(
    organizationId: string,
    actor: RequestUser,
    proposalId: string,
    command: ExecuteCallIntelligenceProposalDto,
  ) {
    switch (command.action) {
      case CallIntelligenceProposalCommand.APPROVE:
        return this.actions.approve(organizationId, actor, proposalId);
      case CallIntelligenceProposalCommand.REJECT:
        return this.actions.reject(
          organizationId,
          actor,
          proposalId,
          command.reason!,
        );
      case CallIntelligenceProposalCommand.RETRY:
        return this.actions.retry(organizationId, actor, proposalId);
    }
  }
}
