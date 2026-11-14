import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlatformMeeting,
  PlatformMeetingSchema,
} from '../../database/schemas/platform-meeting.schema';
import {
  ManagedCalendarEvent,
  ManagedCalendarEventSchema,
} from '../../database/schemas/managed-calendar-event.schema';
import {
  AdminMeetingOperationLease,
  AdminMeetingOperationLeaseSchema,
} from '../../database/schemas/admin-meeting-operation-lease.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MeetingBotsModule } from '../meeting-bots/meeting-bots.module';
import { UsersModule } from '../users/users.module';
import { AdminMeetingCalendarActionsService } from './admin-meeting-calendar-actions.service';
import { AdminMeetingCalendarQuickActionsService } from './admin-meeting-calendar-quick-actions.service';
import { AdminMeetingOperationLeaseRepository } from './admin-meeting-operation-lease.repository';
import { AdminMeetingOperationLeaseService } from './admin-meeting-operation-lease.service';
import { AdminMeetingCalendarController } from './admin-meeting-calendar.controller';
import { AdminMeetingCalendarRepository } from './admin-meeting-calendar.repository';
import { AdminMeetingCalendarService } from './admin-meeting-calendar.service';

@Module({
  imports: [
    AuditLogsModule,
    CalendarModule,
    MeetingBotsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: PlatformMeeting.name, schema: PlatformMeetingSchema },
      {
        name: ManagedCalendarEvent.name,
        schema: ManagedCalendarEventSchema,
      },
      {
        name: AdminMeetingOperationLease.name,
        schema: AdminMeetingOperationLeaseSchema,
      },
    ]),
  ],
  controllers: [AdminMeetingCalendarController],
  providers: [
    AdminMeetingCalendarRepository,
    AdminMeetingCalendarService,
    AdminMeetingCalendarActionsService,
    AdminMeetingCalendarQuickActionsService,
    AdminMeetingOperationLeaseRepository,
    AdminMeetingOperationLeaseService,
  ],
})
export class AdminMeetingCalendarModule {}
