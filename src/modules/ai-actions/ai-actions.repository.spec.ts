import { Model } from 'mongoose';
import { Agent } from '../../database/schemas/agent.schema';
import {
  AiActionProposal,
  AiActionProposalStatus,
} from '../../database/schemas/ai-action-proposal.schema';
import { AiActionsRepository } from './ai-actions.repository';

describe('AiActionsRepository recoverable execution rollback', () => {
  it('atomically restores only the expected executing proposal to pending', async () => {
    const exec = jest.fn().mockResolvedValue({
      _id: 'proposal-1',
      status: AiActionProposalStatus.PENDING,
    });
    const lean = jest.fn().mockReturnValue({ exec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const model = { findOneAndUpdate } as unknown as Model<AiActionProposal>;
    const repository = new AiActionsRepository(model, {} as Model<Agent>);

    await repository.restorePendingAfterRecoverableFailure(
      'org-1',
      'proposal-1',
      'Calendar is not connected',
      AiActionProposalStatus.EXECUTING,
    );

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'proposal-1',
        organizationId: 'org-1',
        status: AiActionProposalStatus.EXECUTING,
      },
      {
        $set: {
          status: AiActionProposalStatus.PENDING,
          executionError: 'Calendar is not connected',
        },
        $unset: {
          approvedByUserId: 1,
          approvedByUserName: 1,
          approvedAt: 1,
          executionStartedAt: 1,
        },
      },
      { new: true, runValidators: true },
    );
  });
});
