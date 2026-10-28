import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SystemServicesController } from './system-services.controller';
import { SystemServicesRepository } from './system-services.repository';
import { SystemServicesService } from './system-services.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [SystemServicesController],
  providers: [SystemServicesRepository, SystemServicesService],
  exports: [SystemServicesService],
})
export class SystemServicesModule {}
