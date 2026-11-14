import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CalendarService } from '../calendar/calendar.service';
import { PlatformMeetingsService } from '../meeting-bots/platform-meetings.service';
import { adminMeetingCapabilities } from './admin-meeting-capabilities';
import { AdminMeetingCalendarRepository } from './admin-meeting-calendar.repository';
import { AdminMeetingOperationLeaseService } from './admin-meeting-operation-lease.service';

type AdminMeetingAction = 'COMPLETE' | 'CANCEL' | 'DELETE';

@Injectable()
export class AdminMeetingCalendarActionsService {
  constructor(
    private readonly repository: AdminMeetingCalendarRepository,
    private readonly platformMeetings: PlatformMeetingsService,
    private readonly calendar: CalendarService,
    private readonly audits: AuditLogsService,
    private readonly leases: AdminMeetingOperationLeaseService,
  ) {}

  async complete(
    actor: RequestUser,
    sourceType: AdminMeetingSourceType,
    id: string,
    now = new Date(),
  ) {
    return this.leases.run({
      key: this.leaseKey(sourceType, id),
      operation: 'COMPLETE',
      actorUserId: actor.id,
      execute: async () => {
        const target = await this.requireTarget(sourceType, id, now);
        this.assertCapability(target.capabilities.canComplete, 'completed');
        if (sourceType !== AdminMeetingSourceType.PLATFORM_MEETING) {
          throw new ConflictException(
            'Synchronized calendar events are completed from provider state',
          );
        }

        await this.platformMeetings.completeAsPlatformAdmin(
          target.organizationId,
          id,
          now,
        );
        await this.audit(actor, target, 'COMPLETE');
        return this.response(target, 'COMPLETE', AdminMeetingStatus.COMPLETED);
      },
    });
  }

  async cancel(
    actor: RequestUser,
    sourceType: AdminMeetingSourceType,
    id: string,
    now = new Date(),
  ) {
    return this.leases.run({
      key: this.leaseKey(sourceType, id),
      operation: 'CANCEL',
      actorUserId: actor.id,
      execute: async () => {
        const target = await this.requireTarget(sourceType, id, now);
        this.assertCapability(target.capabilities.canCancel, 'cancelled');

        if (sourceType === AdminMeetingSourceType.PLATFORM_MEETING) {
          await this.platformMeetings.cancelAsPlatformAdmin(
            target.organizationId,
            id,
          );
        } else {
          await this.calendar.cancelEvent(target.organizationId, id);
        }
        await this.audit(actor, target, 'CANCEL');
        return this.response(target, 'CANCEL', AdminMeetingStatus.CANCELLED);
      },
    });
  }

  async delete(
    actor: RequestUser,
    sourceType: AdminMeetingSourceType,
    id: string,
    now = new Date(),
  ) {
    return this.leases.run({
      key: this.leaseKey(sourceType, id),
      operation: 'DELETE',
      actorUserId: actor.id,
      execute: async () => {
        const target = await this.requireTarget(sourceType, id, now);
        this.assertCapability(target.capabilities.canDelete, 'deleted');
        if (sourceType !== AdminMeetingSourceType.PLATFORM_MEETING) {
          throw new ConflictException(
            'Synchronized calendar events cannot be permanently deleted',
          );
        }

        await this.platformMeetings.deletePermanentAsPlatformAdmin(
          target.organizationId,
          id,
        );
        await this.audit(actor, target, 'DELETE');
        return {
          ...this.response(target, 'DELETE', target.status),
          deleted: true,
        };
      },
    });
  }

  private async requireTarget(
    sourceType: AdminMeetingSourceType,
    id: string,
    now: Date,
  ) {
    const target = await this.repository.findActionTarget(sourceType, id, now);
    if (!target) throw new NotFoundException('Meeting calendar item not found');
    return target;
  }

  private assertCapability(allowed: boolean, action: string) {
    if (!allowed) {
      throw new ConflictException(`This meeting cannot be ${action}`);
    }
  }

  private leaseKey(sourceType: AdminMeetingSourceType, id: string) {
    return `calendar-item:${sourceType}:${id}`;
  }

  private response(
    target: Awaited<ReturnType<typeof this.requireTarget>>,
    action: AdminMeetingAction,
    status: AdminMeetingStatus,
  ) {
    return {
      id: target.id,
      sourceType: target.sourceType,
      organizationId: target.organizationId,
      action,
      status,
      changedAt: new Date().toISOString(),
    };
  }

  private async audit(
    actor: RequestUser,
    target: Awaited<ReturnType<typeof this.requireTarget>>,
    action: AdminMeetingAction,
  ) {
    await this.audits.create({
      organizationId: target.organizationId,
      userId: actor.id,
      action: `PLATFORM_ADMIN_MEETING_${action}`,
      resourceType: target.sourceType,
      resourceId: target.id,
      metadata: {
        platformAdmin: true,
        actorOrganizationId: actor.organizationId,
        previousStatus: target.status,
        previousRawStatus: target.rawStatus,
      },
    });
  }
}
