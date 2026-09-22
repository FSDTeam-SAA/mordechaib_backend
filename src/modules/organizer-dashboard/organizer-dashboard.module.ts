import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AiActionProposal,
  AiActionProposalSchema,
} from '../../database/schemas/ai-action-proposal.schema';
import {
  ManagedCalendarEvent,
  ManagedCalendarEventSchema,
} from '../../database/schemas/managed-calendar-event.schema';
import {
  PlatformMeeting,
  PlatformMeetingSchema,
} from '../../database/schemas/platform-meeting.schema';
import {
  TaskItem,
  TaskItemSchema,
} from '../../database/schemas/task-item.schema';
import { AgentsModule } from '../agents/agents.module';
import { AiTelemetryModule } from '../ai-telemetry/ai-telemetry.module';
import { AuthModule } from '../auth/auth.module';
import { CallIntelligenceModule } from '../call-intelligence/call-intelligence.module';
import { ChiefOfStaffModule } from '../chief-of-staff/chief-of-staff.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrganizerDashboardController } from './organizer-dashboard.controller';
import { OrganizerDashboardRepository } from './organizer-dashboard.repository';
import { OrganizerDashboardService } from './organizer-dashboard.service';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    AgentsModule,
    AiTelemetryModule,
    CallIntelligenceModule,
    ChiefOfStaffModule,
    MongooseModule.forFeature([
      { name: TaskItem.name, schema: TaskItemSchema },
      { name: PlatformMeeting.name, schema: PlatformMeetingSchema },
      { name: ManagedCalendarEvent.name, schema: ManagedCalendarEventSchema },
      { name: AiActionProposal.name, schema: AiActionProposalSchema },
    ]),
  ],
  controllers: [OrganizerDashboardController],
  providers: [OrganizerDashboardService, OrganizerDashboardRepository],
})
export class OrganizerDashboardModule {}
