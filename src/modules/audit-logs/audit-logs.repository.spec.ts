import { AuditLogsRepository } from './audit-logs.repository';

describe('AuditLogsRepository', () => {
  it('returns action counts from one bounded aggregation', async () => {
    const exec = jest.fn().mockResolvedValue([
      { _id: 'ACTION_A', count: 3 },
      { _id: 'ACTION_B', count: 1 },
    ]);
    const model = {
      aggregate: jest.fn().mockReturnValue({ exec }),
    };
    const repository = new AuditLogsRepository(model as never);
    const range = {
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-08T00:00:00.000Z'),
    };

    await expect(
      repository.countByActions(['ACTION_A', 'ACTION_B'], range),
    ).resolves.toEqual({ ACTION_A: 3, ACTION_B: 1 });
    expect(model.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          action: { $in: ['ACTION_A', 'ACTION_B'] },
          createdAt: { $gte: range.from, $lt: range.to },
        },
      },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]);
  });

  it('does not query MongoDB when no actions are requested', async () => {
    const model = { aggregate: jest.fn() };
    const repository = new AuditLogsRepository(model as never);

    await expect(
      repository.countByActions([], {
        from: new Date('2026-11-01T00:00:00.000Z'),
        to: new Date('2026-11-08T00:00:00.000Z'),
      }),
    ).resolves.toEqual({});
    expect(model.aggregate).not.toHaveBeenCalled();
  });

  it('counts one action within an organization', async () => {
    const exec = jest.fn().mockResolvedValue(28);
    const model = {
      countDocuments: jest.fn().mockReturnValue({ exec }),
    };
    const repository = new AuditLogsRepository(model as never);

    await expect(
      repository.countByOrganizationAndAction(
        'organization-1',
        'ROI_REPORT_GENERATED',
      ),
    ).resolves.toBe(28);
    expect(model.countDocuments).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      action: 'ROI_REPORT_GENERATED',
    });
  });
});
