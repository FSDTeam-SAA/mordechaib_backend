import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notification,
  NotificationSchema,
} from '../../database/schemas/notification.schema';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsAdminController } from './notifications-admin.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsScheduler } from './notifications.scheduler';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    SettingsModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationsScheduler,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}

