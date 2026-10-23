import { Module } from '@nestjs/common';
import { CloudinaryImageStorageService } from '../../common/storage/cloudinary-image-storage.service';
import { AiIntegrationModule } from '../ai-integration/ai-integration.module';
import { AiAgentCatalogController } from './ai-agent-catalog.controller';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';
import { AiServiceSecretGuard } from '../../common/guards/ai-service-secret.guard';
import { AgentImageStorageService } from './agent-image-storage.service';

@Module({
  imports: [AiIntegrationModule],
  controllers: [AgentsController, AiAgentCatalogController],
  providers: [
    AgentsService,
    AgentsRepository,
    AiServiceSecretGuard,
    CloudinaryImageStorageService,
    AgentImageStorageService,
  ],
  exports: [AgentsService],
})
export class AgentsModule {}
