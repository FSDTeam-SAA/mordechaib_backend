import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { CustomerActivityType } from '../../common/enums/customer-activity-type.enum';
import { EmailDraftStatus } from '../../common/enums/email-provider.enum';
import { TaskItem } from '../../database/schemas/task-item.schema';

export type ContactActivityCursor = {
  occurredAt: Date;
  sortKey: string;
};

export type ContactActivityCrmIdentity = {
  provider: string;
  objectType: string;
  externalId: string;
};

export type ContactActivityRecord = {
  id: string;
  type: CustomerActivityType;
  action: string;
  title: string;
  status?: string;
  occurredAt: Date;
  source: { type: string; id: string };
  metadata: Record<string, unknown>;
  sortKey: string;
};

@Injectable()
export class ContactActivityRepository {
  constructor(
    @InjectModel(TaskItem.name) private readonly tasks: Model<TaskItem>,
  ) {}

  list(input: {
    organizationId: string;
    contactId: string;
    crmIdentities: ContactActivityCrmIdentity[];
    limit: number;
    cursor?: ContactActivityCursor;
  }) {
    return this.tasks
      .aggregate<ContactActivityRecord>(this.pipeline(input))
      .exec();
  }

  private pipeline(input: {
    organizationId: string;
    contactId: string;
    crmIdentities: ContactActivityCrmIdentity[];
    limit: number;
    cursor?: ContactActivityCursor;
  }): PipelineStage[] {
    const { organizationId, contactId, cursor } = input;
    const taskMatch = {
      organizationId,
      contactIds: contactId,
      ...this.dateBoundary('createdAt', cursor),
    };
    const stages: PipelineStage[] = [
      { $match: taskMatch },
      {
        $project: this.eventProjection({
          type: CustomerActivityType.TASK,
          action: 'TASK_CREATED',
          title: '$title',
          status: '$status',
          occurredAt: '$createdAt',
          sourceType: 'TASK',
          metadata: {
            priority: '$priority',
            department: '$department',
            dueDate: '$dueDate',
            assignedToUserId: '$assignedToUserId',
          },
        }),
      },
      this.union('platform_meetings', [
        {
          $match: {
            organizationId,
            contactIds: contactId,
            ...this.dateBoundary('createdAt', cursor),
          },
        },
        {
          $project: this.eventProjection({
            type: CustomerActivityType.MEETING,
            action: 'MEETING_SCHEDULED',
            title: '$title',
            status: '$status',
            occurredAt: '$createdAt',
            sourceType: 'PLATFORM_MEETING',
            metadata: {
              platform: '$platform',
              startsAt: '$startsAt',
              endsAt: '$endsAt',
              durationMinutes: '$durationMinutes',
            },
          }),
        },
      ]),
      this.union('call_logs', [
        {
          $match: {
            organizationId,
            contactId,
            ...this.dateBoundary('createdAt', cursor),
          },
        },
        {
          $project: this.eventProjection({
            type: CustomerActivityType.CALL,
            action: { $concat: ['CALL_', '$status'] },
            title: {
              $concat: [
                { $toLower: '$direction' },
                ' call ',
                '$fromNumber',
                ' to ',
                '$toNumber',
              ],
            },
            status: '$status',
            occurredAt: '$createdAt',
            sourceType: 'CALL',
            metadata: {
              direction: '$direction',
              durationSeconds: '$durationSeconds',
              startedAt: '$startedAt',
              endedAt: '$endedAt',
            },
          }),
        },
      ]),
      this.union('email_drafts', [
        {
          $match: {
            organizationId,
            contactIds: contactId,
            status: EmailDraftStatus.SENT,
            sentAt: { $exists: true, ...this.dateOperator(cursor) },
          },
        },
        {
          $project: this.eventProjection({
            type: CustomerActivityType.EMAIL,
            action: 'EMAIL_SENT',
            title: '$subject',
            status: '$status',
            occurredAt: '$sentAt',
            sourceType: 'EMAIL_DRAFT',
            metadata: {
              provider: '$provider',
              recipientCount: { $size: { $ifNull: ['$to', []] } },
              sentFrom: '$sentFrom',
            },
          }),
        },
      ]),
      this.union('customer_health_snapshots', [
        {
          $match: {
            organizationId,
            contactId,
            ...this.dateBoundary('capturedAt', cursor),
          },
        },
        {
          $project: this.eventProjection({
            type: CustomerActivityType.AI_INSIGHT,
            action: 'CUSTOMER_HEALTH_ANALYZED',
            title: 'Customer health updated',
            status: '$riskLevel',
            occurredAt: '$capturedAt',
            sourceType: 'CUSTOMER_HEALTH_SNAPSHOT',
            metadata: {
              healthScore: '$healthScore',
              riskLevel: '$riskLevel',
              analysisConfidence: '$analysisConfidence',
              analysisSource: '$source',
            },
          }),
        },
      ]),
      this.union('audit_logs', [
        {
          $match: {
            organizationId,
            ...this.dateBoundary('createdAt', cursor),
            $or: this.auditScopes(contactId, input.crmIdentities),
          },
        },
        {
          $project: {
            ...this.eventProjection({
              type: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $in: [
                          '$resourceType',
                          ['crm_record', 'CUSTOMER_CRM_LINK'],
                        ],
                      },
                      then: CustomerActivityType.CRM,
                    },
                    {
                      case: { $eq: ['$resourceType', 'CUSTOMER_NOTE'] },
                      then: CustomerActivityType.NOTE,
                    },
                    {
                      case: { $eq: ['$resourceType', 'CUSTOMER_FILE'] },
                      then: CustomerActivityType.FILE,
                    },
                  ],
                  default: CustomerActivityType.CONTACT,
                },
              },
              action: '$action',
              title: '$action',
              occurredAt: '$createdAt',
              sourceType: '$resourceType',
              sourceId: '$resourceId',
              metadata: {
                provider: '$metadata.provider',
                objectType: '$metadata.objectType',
                externalId: '$metadata.externalId',
                updatedFields: '$metadata.updatedFields',
                preview: '$metadata.preview',
                originalName: '$metadata.originalName',
                mimeType: '$metadata.mimeType',
                sizeBytes: '$metadata.sizeBytes',
                userId: '$userId',
              },
            }),
          },
        },
      ]),
    ];

    if (cursor) {
      stages.push({
        $match: {
          $or: [
            { occurredAt: { $lt: cursor.occurredAt } },
            {
              occurredAt: cursor.occurredAt,
              sortKey: { $lt: cursor.sortKey },
            },
          ],
        },
      });
    }
    stages.push(
      { $sort: { occurredAt: -1, sortKey: -1 } },
      { $limit: input.limit + 1 },
    );
    return stages;
  }

  private eventProjection(input: {
    type: unknown;
    action: unknown;
    title: unknown;
    status?: unknown;
    occurredAt: unknown;
    sourceType: unknown;
    sourceId?: unknown;
    metadata: Record<string, unknown>;
  }) {
    const sourceId = input.sourceId || { $toString: '$_id' };
    const type = this.literal(input.type);
    return {
      _id: 0,
      type,
      action: this.literal(input.action),
      title: this.literal(input.title),
      ...(input.status !== undefined
        ? { status: this.literal(input.status) }
        : {}),
      occurredAt: this.literal(input.occurredAt),
      source: { type: this.literal(input.sourceType), id: sourceId },
      metadata: input.metadata,
      sortKey: {
        $concat: [
          { $toString: type },
          ':',
          { $toString: sourceId },
          ':',
          { $toString: '$_id' },
        ],
      },
      id: {
        $concat: [{ $toString: type }, ':', { $toString: '$_id' }],
      },
    };
  }

  private literal(value: unknown) {
    return typeof value === 'string' && !value.startsWith('$')
      ? { $literal: value }
      : value;
  }

  private union(collection: string, pipeline: PipelineStage[]): PipelineStage {
    return { $unionWith: { coll: collection, pipeline } } as PipelineStage;
  }

  private dateBoundary(field: string, cursor?: ContactActivityCursor) {
    return cursor ? { [field]: { $lte: cursor.occurredAt } } : {};
  }

  private dateOperator(cursor?: ContactActivityCursor) {
    return cursor ? { $lte: cursor.occurredAt } : {};
  }

  private auditScopes(
    contactId: string,
    crmIdentities: ContactActivityCrmIdentity[],
  ) {
    return [
      { resourceType: 'CUSTOMER_CONTACT', resourceId: contactId },
      { resourceType: 'CUSTOMER_CRM_LINK', 'metadata.contactId': contactId },
      { resourceType: 'CUSTOMER_NOTE', 'metadata.contactId': contactId },
      { resourceType: 'CUSTOMER_FILE', 'metadata.contactId': contactId },
      ...crmIdentities.map((identity) => ({
        resourceType: 'crm_record',
        resourceId: identity.externalId,
        'metadata.provider': identity.provider,
        'metadata.objectType': identity.objectType,
      })),
    ];
  }
}
