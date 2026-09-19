import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsRepository } from './organizations.repository';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { OrganizationLogoStorageService } from './organization-logo-storage.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    OrganizationsRepository,
    OrganizationLogoStorageService,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
