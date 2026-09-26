import { TaskStatus } from '../../common/enums/task-status.enum';
import { TaskStatusGroup } from '../../common/enums/task-status-group.enum';
import { TasksRepository } from './tasks.repository';

describe('TasksRepository', () => {
  const asOf = new Date('2026-09-24T06:00:00.000Z');
  let model: Record<string, jest.Mock>;
  let repository: TasksRepository;

  beforeEach(() => {
    const findQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    const countQuery = { exec: jest.fn().mockResolvedValue(0) };
    model = {
      find: jest.fn().mockReturnValue(findQuery),
      countDocuments: jest.fn().mockReturnValue(countQuery),
    };
    repository = new TasksRepository(model as never);
  });

  it('builds one mutually exclusive pending-dashboard filter', async () => {
    await repository.list('org-1', 1, 20, {
      statusGroup: TaskStatusGroup.PENDING,
      asOf,
    });

    expect(model.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      $and: [
        {
          status: {
            $in: [
              TaskStatus.DRAFT,
              TaskStatus.TODO,
              TaskStatus.WAITING,
              TaskStatus.BLOCKED,
            ],
          },
        },
        {
          $or: [
            { dueDate: { $gte: asOf } },
            { dueDate: { $exists: false } },
            { dueDate: null },
          ],
        },
      ],
    });
  });

  it('keeps overdue and explicit due-date bounds in the same filter', async () => {
    const dueFrom = new Date('2026-09-20T00:00:00.000Z');

    await repository.list('org-1', 1, 20, {
      statusGroup: TaskStatusGroup.OVERDUE,
      asOf,
      dueFrom,
    });

    expect(model.find).toHaveBeenCalledWith({
      organizationId: 'org-1',
      status: { $ne: TaskStatus.COMPLETED },
      dueDate: {
        $exists: true,
        $ne: null,
        $lt: asOf,
        $gte: dueFrom,
      },
    });
  });
});
