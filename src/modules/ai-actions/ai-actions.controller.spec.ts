import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { AiActionsController } from './ai-actions.controller';
import { AiActionsService } from './ai-actions.service';
import {
  AiProposalCommand,
  ExecuteAiActionProposalDto,
} from './dto/execute-ai-action-proposal.dto';

describe('AiActionsController proposal actions', () => {
  const organization: RequestOrganization = { id: 'organization-1' };
  const user: RequestUser = {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'Test',
    lastName: 'Owner',
    organizationId: organization.id,
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: false,
  };
  const service = {
    approve: jest.fn(),
    reject: jest.fn(),
    retry: jest.fn(),
  };
  const controller = new AiActionsController(
    service as unknown as AiActionsService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('dispatches APPROVE through the unified endpoint handler', async () => {
    service.approve.mockResolvedValue({ status: 'EXECUTED' });

    await expect(
      controller.executeAction(organization, user, 'proposal-1', {
        action: AiProposalCommand.APPROVE,
      }),
    ).resolves.toEqual({ status: 'EXECUTED' });
    expect(service.approve).toHaveBeenCalledWith(
      organization.id,
      user,
      'proposal-1',
    );
  });

  it('dispatches REJECT with its reason', async () => {
    service.reject.mockResolvedValue({ status: 'REJECTED' });

    await expect(
      controller.executeAction(organization, user, 'proposal-1', {
        action: AiProposalCommand.REJECT,
        reason: 'Not required',
      }),
    ).resolves.toEqual({ status: 'REJECTED' });
    expect(service.reject).toHaveBeenCalledWith(
      organization.id,
      user,
      'proposal-1',
      'Not required',
    );
  });

  it('dispatches RETRY through the unified endpoint handler', async () => {
    service.retry.mockResolvedValue({ status: 'EXECUTED' });

    await expect(
      controller.executeAction(organization, user, 'proposal-1', {
        action: AiProposalCommand.RETRY,
      }),
    ).resolves.toEqual({ status: 'EXECUTED' });
    expect(service.retry).toHaveBeenCalledWith(
      organization.id,
      user,
      'proposal-1',
    );
  });

  it('requires a non-empty reason only for REJECT', async () => {
    const invalidReject = plainToInstance(ExecuteAiActionProposalDto, {
      action: AiProposalCommand.REJECT,
    });
    const validApprove = plainToInstance(ExecuteAiActionProposalDto, {
      action: AiProposalCommand.APPROVE,
    });

    await expect(validate(invalidReject)).resolves.not.toHaveLength(0);
    await expect(validate(validApprove)).resolves.toHaveLength(0);
  });
});
