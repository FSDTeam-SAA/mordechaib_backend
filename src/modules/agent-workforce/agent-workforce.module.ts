import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { AiTelemetryModule } from '../ai-telemetry/ai-telemetry.module';
import { AgentWorkforceController } from './agent-workforce.controller';
import { AgentWorkforceRepository } from './agent-workforce.repository';
import { AgentWorkforceService } from './agent-workforce.service';
import { OrganizationAgentSettingsModule } from '../organization-agent-settings/organization-agent-settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    AgentsModule,
    AiTelemetryModule,
    OrganizationAgentSettingsModule,
    AuditLogsModule,
  ],
  controllers: [AgentWorkforceController],
  providers: [AgentWorkforceRepository, AgentWorkforceService],
  exports: [AgentWorkforceService],
})
export class AgentWorkforceModule {}
