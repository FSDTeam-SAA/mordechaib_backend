import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SupportRequest,
  SupportRequestSchema,
} from '../../database/schemas/support-request.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MessagesModule } from '../messages/messages.module';
import { TemporaryUploadCleanupInterceptor } from '../messages/temporary-upload-cleanup.interceptor';
import { SupportRequestsAdminController } from './support-requests-admin.controller';
import { SupportRequestsController } from './support-requests.controller';
import { SupportRequestsRepository } from './support-requests.repository';
import { SupportRequestsService } from './support-requests.service';

@Module({
  imports: [
    AuditLogsModule,
    MessagesModule,
    MongooseModule.forFeature([
      { name: SupportRequest.name, schema: SupportRequestSchema },
    ]),
  ],
  controllers: [SupportRequestsController, SupportRequestsAdminController],
  providers: [
    SupportRequestsRepository,
    SupportRequestsService,
    TemporaryUploadCleanupInterceptor,
  ],
  exports: [SupportRequestsService],
})
export class SupportRequestsModule {}
