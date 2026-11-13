import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlatformMeeting,
  PlatformMeetingSchema,
} from '../../database/schemas/platform-meeting.schema';
import { AdminMeetingCalendarController } from './admin-meeting-calendar.controller';
import { AdminMeetingCalendarRepository } from './admin-meeting-calendar.repository';
import { AdminMeetingCalendarService } from './admin-meeting-calendar.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformMeeting.name, schema: PlatformMeetingSchema },
    ]),
  ],
  controllers: [AdminMeetingCalendarController],
  providers: [AdminMeetingCalendarRepository, AdminMeetingCalendarService],
})
export class AdminMeetingCalendarModule {}
