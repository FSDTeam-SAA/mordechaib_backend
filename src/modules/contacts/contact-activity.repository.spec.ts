import { Model } from 'mongoose';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { ContactActivityRepository } from './contact-activity.repository';

describe('ContactActivityRepository', () => {
  it('builds one bounded organization-scoped union pipeline', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const aggregate = jest.fn().mockReturnValue({ exec });
    const repository = new ContactActivityRepository({
      aggregate,
    } as unknown as Model<TaskItem>);

    await repository.list({
      organizationId: 'org-1',
      contactId: 'contact-1',
      crmIdentities: [
        {
          provider: 'HUBSPOT',
          objectType: 'contacts',
          externalId: 'hs-1',
        },
      ],
      limit: 20,
    });

    const pipeline = aggregate.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(pipeline[0]).toEqual({
      $match: { organizationId: 'org-1', contactIds: 'contact-1' },
    });
    expect(
      pipeline
        .filter((stage) => '$unionWith' in stage)
        .map((stage) => (stage.$unionWith as { coll: string }).coll),
    ).toEqual([
      'platform_meetings',
      'call_logs',
      'email_drafts',
      'customer_health_snapshots',
      'audit_logs',
    ]);
    const auditStage = pipeline.find(
      (stage) =>
        (stage.$unionWith as { coll?: string } | undefined)?.coll ===
        'audit_logs',
    ) as {
      $unionWith: {
        pipeline: Array<{ $match?: { $or?: Array<Record<string, unknown>> } }>;
      };
    };
    expect(auditStage.$unionWith.pipeline[0].$match?.$or).toEqual(
      expect.arrayContaining([
        {
          resourceType: 'CUSTOMER_NOTE',
          'metadata.contactId': 'contact-1',
        },
        {
          resourceType: 'CUSTOMER_FILE',
          'metadata.contactId': 'contact-1',
        },
      ]),
    );
    expect(pipeline.at(-2)).toEqual({
      $sort: { occurredAt: -1, sortKey: -1 },
    });
    expect(pipeline.at(-1)).toEqual({ $limit: 21 });
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
