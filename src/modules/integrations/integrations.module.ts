import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationsRepository } from './integrations.repository';
import { EmailModule } from '../email/email.module';
import {
  IntegrationOAuthState,
  IntegrationOAuthStateSchema,
} from '../../database/schemas/integration-oauth-state.schema';
import { IntegrationOAuthStateRepository } from './integration-oauth-state.repository';
import { IntegrationOAuthStateService } from './integration-oauth-state.service';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: IntegrationOAuthState.name, schema: IntegrationOAuthStateSchema },
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationsRepository,
    IntegrationOAuthStateRepository,
    IntegrationOAuthStateService,
  ],
  exports: [IntegrationsService, IntegrationOAuthStateService],
})
export class IntegrationsModule {}
