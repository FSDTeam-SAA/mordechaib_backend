import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlatformSetting,
  PlatformSettingSchema,
} from '../../database/schemas/platform-setting.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsRepository } from './platform-settings.repository';
import { PlatformSettingsService } from './platform-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: PlatformSetting.name, schema: PlatformSettingSchema },
    ]),
  ],
  controllers: [SettingsController, PlatformSettingsController],
  providers: [
    SettingsService,
    SettingsRepository,
    PlatformSettingsService,
    PlatformSettingsRepository,
  ],
  exports: [SettingsService, PlatformSettingsService],
})
export class SettingsModule {}
