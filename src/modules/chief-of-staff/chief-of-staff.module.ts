import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Agent, AgentSchema } from '../../database/schemas/agent.schema';
import {
  AiActionProposal,
  AiActionProposalSchema,
} from '../../database/schemas/ai-action-proposal.schema';
import {
  AiSourceAnalysis,
  AiSourceAnalysisSchema,
} from '../../database/schemas/ai-source-analysis.schema';
import {
  ExecutiveBriefing,
  ExecutiveBriefingSchema,
} from '../../database/schemas/executive-briefing.schema';
import {
  ManagedCalendarEvent,
  ManagedCalendarEventSchema,
} from '../../database/schemas/managed-calendar-event.schema';
import {
  Organization,
  OrganizationSchema,
} from '../../database/schemas/organization.schema';
import {
  PlatformMeeting,
  PlatformMeetingSchema,
} from '../../database/schemas/platform-meeting.schema';
import {
  TaskItem,
  TaskItemSchema,
} from '../../database/schemas/task-item.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { AiIntegrationModule } from '../ai-integration/ai-integration.module';
import { AiTelemetryModule } from '../ai-telemetry/ai-telemetry.module';
import {
  StrategicNote,
  StrategicNoteSchema,
} from '../../database/schemas/strategic-note.schema';
import { ChiefOfStaffController } from './chief-of-staff.controller';
import { ChiefOfStaffInsightsController } from './chief-of-staff-insights.controller';
import { ChiefOfStaffInsightsService } from './chief-of-staff-insights.service';
import { ExecutiveBriefingFactsService } from './executive-briefing-facts.service';
import { ExecutiveBriefingResponseValidator } from './executive-briefing-response.validator';
import { ExecutiveBriefingsProcessor } from './executive-briefings.processor';
import {
  EXECUTIVE_BRIEFINGS_QUEUE,
  ExecutiveBriefingsQueue,
} from './executive-briefings.queue';
import { ExecutiveBriefingsRepository } from './executive-briefings.repository';
import { ExecutiveBriefingsService } from './executive-briefings.service';
import { StrategicNotesController } from './strategic-notes.controller';
import { StrategicNotesRepository } from './strategic-notes.repository';
import { StrategicNotesService } from './strategic-notes.service';

@Module({
  imports: [
    AiIntegrationModule,
    AiTelemetryModule,
    BullModule.registerQueue({ name: EXECUTIVE_BRIEFINGS_QUEUE }),
    MongooseModule.forFeature([
      { name: ExecutiveBriefing.name, schema: ExecutiveBriefingSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
      { name: Agent.name, schema: AgentSchema },
      { name: TaskItem.name, schema: TaskItemSchema },
      { name: PlatformMeeting.name, schema: PlatformMeetingSchema },
      {
        name: ManagedCalendarEvent.name,
        schema: ManagedCalendarEventSchema,
      },
      { name: AiActionProposal.name, schema: AiActionProposalSchema },
      { name: AiSourceAnalysis.name, schema: AiSourceAnalysisSchema },
      { name: StrategicNote.name, schema: StrategicNoteSchema },
    ]),
  ],
  controllers: [
    ChiefOfStaffController,
    ChiefOfStaffInsightsController,
    StrategicNotesController,
  ],
  providers: [
    ChiefOfStaffInsightsService,
    ExecutiveBriefingsRepository,
    ExecutiveBriefingFactsService,
    ExecutiveBriefingResponseValidator,
    ExecutiveBriefingsQueue,
    ExecutiveBriefingsProcessor,
    ExecutiveBriefingsService,
    StrategicNotesRepository,
    StrategicNotesService,
  ],
  exports: [ExecutiveBriefingsService],
})
export class ChiefOfStaffModule {}
