import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CustomerCrmLink,
  CustomerCrmLinkSchema,
} from '../../database/schemas/customer-crm-link.schema';
import {
  CustomerContact,
  CustomerContactSchema,
} from '../../database/schemas/customer-contact.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import {
  CrmRecord,
  CrmRecordSchema,
} from '../../database/schemas/crm-record.schema';
import { ContactCrmLinksRepository } from './contact-crm-links.repository';
import { ContactCrmLinksService } from './contact-crm-links.service';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import {
  CustomerHealthSnapshot,
  CustomerHealthSnapshotSchema,
} from '../../database/schemas/customer-health-snapshot.schema';
import {
  TaskItem,
  TaskItemSchema,
} from '../../database/schemas/task-item.schema';
import {
  PlatformMeeting,
  PlatformMeetingSchema,
} from '../../database/schemas/platform-meeting.schema';
import { CallLog, CallLogSchema } from '../../database/schemas/call-log.schema';
import { ContactWorkspaceRepository } from './contact-workspace.repository';
import { ContactWorkspaceService } from './contact-workspace.service';
import { ContactActivityRepository } from './contact-activity.repository';
import { ContactActivityService } from './contact-activity.service';
import {
  CustomerNote,
  CustomerNoteSchema,
} from '../../database/schemas/customer-note.schema';
import {
  CustomerFile,
  CustomerFileSchema,
} from '../../database/schemas/customer-file.schema';
import { ContactNotesRepository } from './contact-notes.repository';
import { ContactNotesService } from './contact-notes.service';
import { ContactFilesRepository } from './contact-files.repository';
import { ContactFilesService } from './contact-files.service';
import { TemporaryUploadCleanupInterceptor } from '../messages/temporary-upload-cleanup.interceptor';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';
import { CrmDeal, CrmDealSchema } from '../../database/schemas/crm-deal.schema';
import { ContactCommercialSummaryService } from './contact-commercial-summary.service';
import { ContactWorkspaceActionsService } from './contact-workspace-actions.service';
import { ContactCrmRecordsReader } from './contact-crm-records.reader';

@Module({
  imports: [
    AuditLogsModule,
    ConfigModule,
    MongooseModule.forFeature([
      { name: CustomerContact.name, schema: CustomerContactSchema },
      { name: CustomerCrmLink.name, schema: CustomerCrmLinkSchema },
      { name: TaskItem.name, schema: TaskItemSchema },
      { name: PlatformMeeting.name, schema: PlatformMeetingSchema },
      { name: CallLog.name, schema: CallLogSchema },
      { name: CustomerNote.name, schema: CustomerNoteSchema },
      { name: CustomerFile.name, schema: CustomerFileSchema },
      { name: CrmDeal.name, schema: CrmDealSchema },
      { name: CrmRecord.name, schema: CrmRecordSchema },
      {
        name: CustomerHealthSnapshot.name,
        schema: CustomerHealthSnapshotSchema,
      },
    ]),
  ],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactsRepository,
    ContactCrmLinksService,
    ContactCrmLinksRepository,
    ContactWorkspaceService,
    ContactWorkspaceRepository,
    ContactActivityService,
    ContactActivityRepository,
    ContactNotesService,
    ContactNotesRepository,
    ContactFilesService,
    ContactFilesRepository,
    TemporaryUploadCleanupInterceptor,
    CloudinaryMessageAttachmentStorage,
    ContactCommercialSummaryService,
    ContactWorkspaceActionsService,
    ContactCrmRecordsReader,
  ],
  exports: [
    ContactsService,
    ContactCrmLinksService,
    ContactWorkspaceService,
    ContactActivityService,
    ContactNotesService,
    ContactFilesService,
  ],
})
export class ContactsModule {}
