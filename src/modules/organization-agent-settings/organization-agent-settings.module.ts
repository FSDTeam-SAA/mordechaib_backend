import { Module } from '@nestjs/common';
import { OrganizationAgentSettingsService } from './organization-agent-settings.service';

@Module({
  providers: [OrganizationAgentSettingsService],
  exports: [OrganizationAgentSettingsService],
})
export class OrganizationAgentSettingsModule {}
