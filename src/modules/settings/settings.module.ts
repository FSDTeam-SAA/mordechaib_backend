import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlatformSetting,
  PlatformSettingSchema,
} from '../../database/schemas/platform-setting.schema';
import {
  PlatformNotificationSetting,
  PlatformNotificationSettingSchema,
} from '../../database/schemas/platform-notification-setting.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsRepository } from './platform-settings.repository';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformNotificationSettingsController } from './platform-notification-settings.controller';
import { PlatformNotificationSettingsRepository } from './platform-notification-settings.repository';
import { PlatformNotificationSettingsService } from './platform-notification-settings.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MaintenanceModeGuard } from '../../common/guards/maintenance-mode.guard';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    AuditLogsModule,
    OrganizationsModule,
    MongooseModule.forFeature([
      { name: PlatformSetting.name, schema: PlatformSettingSchema },
      {
        name: PlatformNotificationSetting.name,
        schema: PlatformNotificationSettingSchema,
      },
    ]),
  ],
  controllers: [
    SettingsController,
    PlatformSettingsController,
    PlatformNotificationSettingsController,
  ],
  providers: [
    SettingsService,
    SettingsRepository,
    PlatformSettingsService,
    PlatformSettingsRepository,
    PlatformNotificationSettingsService,
    PlatformNotificationSettingsRepository,
    {
      provide: APP_GUARD,
      useClass: MaintenanceModeGuard,
    },
  ],
  exports: [
    SettingsService,
    PlatformSettingsService,
    PlatformNotificationSettingsService,
  ],
})
export class SettingsModule {}
