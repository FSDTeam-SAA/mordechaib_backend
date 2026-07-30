import { Injectable } from '@nestjs/common';
import { ApprovalsService } from '../approvals/approvals.service';

@Injectable()
export class AiService {
  constructor(private readonly approvalsService: ApprovalsService) {}

  async analyzeText(organizationId: string, text: string) {
    // TODO: Replace with OpenAI structured output.
    const summary = text.slice(0, 180);

    const approval = await this.approvalsService.createApproval({
      organizationId,
      actionType: 'CREATE_TASK',
      payload: {
        title: 'Follow up from AI analysis',
        description: summary,
      },
    });

    return { summary, suggestedActions: [approval] };
  }
}
