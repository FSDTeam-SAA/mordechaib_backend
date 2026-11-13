import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { CallLog } from '../../database/schemas/call-log.schema';
import { CustomerHealthSnapshot } from '../../database/schemas/customer-health-snapshot.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { CustomerNote } from '../../database/schemas/customer-note.schema';
import { CustomerFile } from '../../database/schemas/customer-file.schema';
import { CustomerFileStatus } from '../../common/enums/customer-file-status.enum';
import { CrmDeal } from '../../database/schemas/crm-deal.schema';

@Injectable()
export class ContactWorkspaceRepository {
  constructor(
    @InjectModel(TaskItem.name) private readonly tasks: Model<TaskItem>,
    @InjectModel(PlatformMeeting.name)
    private readonly meetings: Model<PlatformMeeting>,
    @InjectModel(CallLog.name) private readonly calls: Model<CallLog>,
    @InjectModel(CustomerHealthSnapshot.name)
    private readonly health: Model<CustomerHealthSnapshot>,
    @InjectModel(CustomerNote.name)
    private readonly notes: Model<CustomerNote>,
    @InjectModel(CustomerFile.name)
    private readonly files: Model<CustomerFile>,
    @InjectModel(CrmDeal.name)
    private readonly deals: Model<CrmDeal>,
  ) {}

  async openTasks(organizationId: string, contactId: string, limit: number) {
    const filter = {
      organizationId,
      contactIds: contactId,
      status: { $ne: TaskStatus.COMPLETED },
    };
    const [items, total] = await Promise.all([
      this.tasks
        .find(filter)
        .select(
          'title status priority department assignedToUserId dueDate estimatedDurationMinutes proposedByAgent createdAt updatedAt',
        )
        .sort({ dueDate: 1, createdAt: -1, _id: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.tasks.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async upcomingMeetings(
    organizationId: string,
    contactId: string,
    limit: number,
    asOf: Date,
  ) {
    const filter = {
      organizationId,
      contactIds: contactId,
      startsAt: { $gte: asOf },
      status: {
        $in: [
          PlatformMeetingStatus.CREATING,
          PlatformMeetingStatus.READY,
          PlatformMeetingStatus.SCHEDULED,
        ],
      },
    };
    const [items, total] = await Promise.all([
      this.meetings
        .find(filter)
        .select(
          'platform title agenda startsAt endsAt durationMinutes timezone status botRequested reminderMinutesBeforeStart createdAt updatedAt',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(limit)
        .lean()
        .exec(),
      this.meetings.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async recentCalls(organizationId: string, contactId: string, limit: number) {
    const filter = { organizationId, contactId };
    const [items, total] = await Promise.all([
      this.calls
        .find(filter)
        .select(
          'callSid direction status fromNumber toNumber durationSeconds price priceUnit startedAt endedAt transcriptionStatus createdAt updatedAt',
        )
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.calls.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  latestHealth(organizationId: string, contactId: string) {
    return this.health
      .findOne({ organizationId, contactId })
      .sort({ capturedAt: -1, _id: -1 })
      .lean()
      .exec();
  }

  async recentNotes(organizationId: string, contactId: string, limit: number) {
    const filter = {
      organizationId,
      contactId,
      deletedAt: { $exists: false },
    };
    const [items, total] = await Promise.all([
      this.notes
        .find(filter)
        .select(
          'content source revision createdByUserId updatedByUserId createdAt updatedAt',
        )
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.notes.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async recentFiles(organizationId: string, contactId: string, limit: number) {
    const filter = {
      organizationId,
      contactId,
      status: CustomerFileStatus.ACTIVE,
    };
    const [items, total] = await Promise.all([
      this.files
        .find(filter)
        .select(
          'category originalName mimeType sizeBytes checksumSha256 uploadedByUserId createdAt updatedAt',
        )
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.files.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  linkedDeals(
    organizationId: string,
    identities: Array<{ provider: string; externalId: string }>,
  ) {
    if (!identities.length) return Promise.resolve([]);
    return this.deals
      .find({
        organizationId,
        archived: false,
        $or: identities.map((identity) => ({
          provider: identity.provider,
          externalId: identity.externalId,
        })),
      })
      .select(
        'provider externalId name amount currency providerStage stageCategory closeDate ownerId ownerName providerUpdatedAt syncedAt',
      )
      .lean()
      .exec();
  }
}
