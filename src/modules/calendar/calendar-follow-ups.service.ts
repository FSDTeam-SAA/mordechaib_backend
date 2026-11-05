import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { MeetingFollowUpStatus } from '../../common/enums/meeting-follow-up-status.enum';
import { MeetingFollowUp } from '../../database/schemas/meeting-follow-up.schema';
import { ListMeetingFollowUpsQueryDto } from './dto/list-meeting-follow-ups-query.dto';
import { ResolveMeetingFollowUpDto } from './dto/resolve-meeting-follow-up.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class CalendarFollowUpsService {
  private readonly logger = new Logger(CalendarFollowUpsService.name);

  constructor(
    @InjectModel(MeetingFollowUp.name)
    private readonly followUps: Model<MeetingFollowUp>,
    private readonly audits: AuditLogsService,
  ) {}

  async list(organizationId: string, query: ListMeetingFollowUpsQueryDto) {
    const filter = { organizationId, status: query.status };
    const [items, total] = await Promise.all([
      this.followUps
        .find(filter)
        .sort({ detectedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.followUps.countDocuments(filter).exec(),
    ]);
    return {
      items: items.map((item) => ({ ...item, id: String(item._id), _id: undefined })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async resolve(
    organizationId: string,
    userId: string,
    id: string,
    input: ResolveMeetingFollowUpDto,
  ) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid follow-up id');
    const updated = await this.followUps
      .findOneAndUpdate(
        { _id: id, organizationId, status: MeetingFollowUpStatus.PENDING },
        {
          $set: {
            status: input.status,
            resolvedAt: new Date(),
            resolvedByUserId: userId,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
    if (updated) {
      await this.audit(organizationId, userId, id, input.status);
      return { ...updated, id: String(updated._id), _id: undefined };
    }
    const existing = await this.followUps.exists({ _id: id, organizationId });
    if (!existing) throw new NotFoundException('Meeting follow-up not found');
    throw new ConflictException('Meeting follow-up is already resolved');
  }

  private async audit(
    organizationId: string,
    userId: string,
    id: string,
    status: ResolveMeetingFollowUpDto['status'],
  ) {
    try {
      await this.audits.create({
        organizationId,
        userId,
        action: 'MEETING_FOLLOW_UP_RESOLVED',
        resourceType: 'MEETING_FOLLOW_UP',
        resourceId: id,
        metadata: { status },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to write follow-up audit: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
