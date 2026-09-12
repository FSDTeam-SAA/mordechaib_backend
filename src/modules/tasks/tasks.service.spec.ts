import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { AgentType } from '../../common/enums/agent-type.enum';

describe('TasksService', () => {
  let repository: Record<string, jest.Mock>;
  let service: TasksService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findByAiActionProposalId: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    service = new TasksService(repository as unknown as TasksRepository);
  });

  it('creates an AI-proposed task with the approver as creator', async () => {
    repository.findByAiActionProposalId.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      _id: 'task-1',
      organizationId: 'org-1',
      createdByUserId: 'approver-1',
      title: 'Send proposal',
      aiActionProposalId: 'proposal-object-id',
      proposedByAgent: {
        id: 'sales-agent',
        name: 'Sales Agent',
        type: AgentType.SALES,
      },
    });

    await service.createFromAiProposal(
      'org-1',
      'approver-1',
      { title: 'Send proposal' },
      {
        aiActionProposalId: 'proposal-object-id',
        proposedByAgent: {
          id: 'sales-agent',
          name: 'Sales Agent',
          type: AgentType.SALES,
        },
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: 'approver-1',
        aiActionProposalId: 'proposal-object-id',
        proposedByAgent: {
          id: 'sales-agent',
          name: 'Sales Agent',
          type: AgentType.SALES,
        },
      }),
    );
  });

  it('creates a task with the organization and creator context', async () => {
    repository.create.mockResolvedValue({
      _id: 'task-1',
      organizationId: 'org-1',
      createdByUserId: 'user-1',
      title: 'Prepare Q3 pricing sheet',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    });

    const result = await service.create('org-1', 'user-1', {
      title: 'Prepare Q3 pricing sheet',
      dueDate: '2026-09-20T00:00:00.000Z',
      tags: ['#Finance', '#Finance'],
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        createdByUserId: 'user-1',
        dueDate: new Date('2026-09-20T00:00:00.000Z'),
        tags: ['#Finance'],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'task-1',
        title: 'Prepare Q3 pricing sheet',
      }),
    );
    expect(result).not.toHaveProperty('organizationId');
  });

  it('passes organization-scoped filters to the repository', async () => {
    repository.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      pages: 1,
    });

    await service.findAll('org-1', {
      page: 1,
      limit: 20,
      search: 'finance',
      status: TaskStatus.IN_PROGRESS,
    });

    expect(repository.list).toHaveBeenCalledWith('org-1', 1, 20, {
      search: 'finance',
      status: TaskStatus.IN_PROGRESS,
      priority: undefined,
      department: undefined,
      assignedToUserId: undefined,
      dueFrom: undefined,
      dueTo: undefined,
    });
  });

  it('rejects an invalid due-date range', async () => {
    await expect(
      service.findAll('org-1', {
        page: 1,
        limit: 20,
        dueFrom: '2026-09-20T00:00:00.000Z',
        dueTo: '2026-09-19T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('scopes reads and updates and reports missing tasks', async () => {
    repository.findById.mockResolvedValue(null);
    repository.updateById.mockResolvedValue(null);

    await expect(
      service.findOne('org-1', '66cc9bdfa847ea856c7b41d2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update('org-1', '66cc9bdfa847ea856c7b41d2', {
        status: TaskStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findById).toHaveBeenCalledWith(
      'org-1',
      '66cc9bdfa847ea856c7b41d2',
    );
    expect(repository.updateById).toHaveBeenCalledWith(
      'org-1',
      '66cc9bdfa847ea856c7b41d2',
      { status: TaskStatus.COMPLETED },
    );
  });
});
