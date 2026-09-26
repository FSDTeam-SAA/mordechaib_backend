import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { AgentType } from '../../common/enums/agent-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskStatusGroup } from '../../common/enums/task-status-group.enum';
import { TaskDepartment } from '../../common/enums/task-department.enum';

describe('TasksService', () => {
  let repository: Record<string, jest.Mock>;
  let service: TasksService;
  let notifications: Record<string, jest.Mock>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findByAiActionProposalId: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    notifications = { notifyAgentTaskCompleted: jest.fn() };
    service = new TasksService(
      repository as unknown as TasksRepository,
      notifications as unknown as NotificationsService,
    );
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
        department: TaskDepartment.SALES,
        proposedByAgent: {
          id: 'sales-agent',
          name: 'Sales Agent',
          type: AgentType.SALES,
        },
      }),
    );
  });

  it('infers a strategy task department from a strategy agent', async () => {
    repository.findByAiActionProposalId.mockResolvedValue(null);
    repository.create.mockImplementation((input) =>
      Promise.resolve({ _id: 'task-1', ...input }),
    );

    await service.createFromAiProposal(
      'org-1',
      'approver-1',
      { title: 'Review market positioning' },
      {
        aiActionProposalId: 'proposal-object-id',
        proposedByAgent: {
          id: 'strategy-agent',
          name: 'Dexter',
          type: AgentType.STRATEGY,
        },
      },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ department: TaskDepartment.STRATEGY }),
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
      statusGroup: undefined,
      asOf: undefined,
      priority: undefined,
      department: undefined,
      assignedToUserId: undefined,
      dueFrom: undefined,
      dueTo: undefined,
    });
  });

  it('rejects conflicting exact-status and dashboard-group filters', async () => {
    await expect(
      service.findAll('org-1', {
        page: 1,
        limit: 20,
        status: TaskStatus.TODO,
        statusGroup: TaskStatusGroup.PENDING,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('sets completedAt when a task is created as completed', async () => {
    repository.create.mockImplementation((input) =>
      Promise.resolve({ _id: 'task-1', ...input }),
    );

    await service.create('org-1', 'user-1', {
      title: 'Already completed',
      status: TaskStatus.COMPLETED,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
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

  it('notifies when an AI-proposed task first becomes completed', async () => {
    repository.findById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d2',
      organizationId: 'org-1',
      title: 'Prepare quote',
      status: TaskStatus.IN_PROGRESS,
      createdByUserId: 'user-1',
      proposedByAgent: {
        id: 'agent-1',
        name: 'Steve',
        type: AgentType.SALES,
      },
    });
    repository.updateById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d2',
      organizationId: 'org-1',
      title: 'Prepare quote',
      status: TaskStatus.COMPLETED,
      createdByUserId: 'user-1',
      proposedByAgent: {
        id: 'agent-1',
        name: 'Steve',
        type: AgentType.SALES,
      },
    });

    await service.update('org-1', '66cc9bdfa847ea856c7b41d2', {
      status: TaskStatus.COMPLETED,
    });

    expect(notifications.notifyAgentTaskCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ status: TaskStatus.COMPLETED }),
    );
  });

  it('clears completedAt when a completed task is reopened', async () => {
    repository.findById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d2',
      organizationId: 'org-1',
      title: 'Reopened task',
      status: TaskStatus.COMPLETED,
      completedAt: new Date('2026-09-20T10:00:00.000Z'),
      createdByUserId: 'user-1',
    });
    repository.updateById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d2',
      organizationId: 'org-1',
      title: 'Reopened task',
      status: TaskStatus.IN_PROGRESS,
      createdByUserId: 'user-1',
    });

    await service.update('org-1', '66cc9bdfa847ea856c7b41d2', {
      status: TaskStatus.IN_PROGRESS,
    });

    expect(repository.updateById).toHaveBeenCalledWith(
      'org-1',
      '66cc9bdfa847ea856c7b41d2',
      { status: TaskStatus.IN_PROGRESS },
      ['completedAt'],
    );
  });
});
