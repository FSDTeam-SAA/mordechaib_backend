import { forwardRef, Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MeetingBotsModule } from '../meeting-bots/meeting-bots.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import {
  AiActionsController,
  SourceActionCenterController,
} from './ai-actions.controller';
import { AiActionsRepository } from './ai-actions.repository';
import { AiActionsService } from './ai-actions.service';
import { SourceAnalysesModule } from '../source-analyses/source-analyses.module';

@Module({
  imports: [
    AuditLogsModule,
    forwardRef(() => MeetingBotsModule),
    OrganizationsModule,
    TasksModule,
    UsersModule,
    SourceAnalysesModule,
  ],
  controllers: [AiActionsController, SourceActionCenterController],
  providers: [AiActionsService, AiActionsRepository],
  exports: [AiActionsService],
})
export class AiActionsModule {}
