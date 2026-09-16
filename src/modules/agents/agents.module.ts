import { Module } from '@nestjs/common';
import { AiIntegrationModule } from '../ai-integration/ai-integration.module';
import { AiAgentCatalogController } from './ai-agent-catalog.controller';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';
import { AiServiceSecretGuard } from './guards/ai-service-secret.guard';

@Module({
  imports: [AiIntegrationModule],
  controllers: [AgentsController, AiAgentCatalogController],
  providers: [AgentsService, AgentsRepository, AiServiceSecretGuard],
  exports: [AgentsService],
})
export class AgentsModule {}
