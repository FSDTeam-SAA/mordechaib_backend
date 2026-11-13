import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EmailConnection,
  EmailConnectionSchema,
} from '../../database/schemas/email-connection.schema';
import {
  EmailDraft,
  EmailDraftSchema,
} from '../../database/schemas/email-draft.schema';
import {
  EmailOAuthState,
  EmailOAuthStateSchema,
} from '../../database/schemas/email-oauth-state.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import {
  PlatformMeeting,
  PlatformMeetingSchema,
} from '../../database/schemas/platform-meeting.schema';
import {
  ManagedCalendarEvent,
  ManagedCalendarEventSchema,
} from '../../database/schemas/managed-calendar-event.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EmailConnectionsController } from './email-connections.controller';
import { EmailConnectionsRepository } from './email-connections.repository';
import { EmailConnectionsService } from './email-connections.service';
import { EmailDraftsController } from './email-drafts.controller';
import { EmailDraftsRepository } from './email-drafts.repository';
import { EmailDraftsService } from './email-drafts.service';
import { EmailProviderClient } from './email-provider.client';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    AuditLogsModule,
    ContactsModule,
    MongooseModule.forFeature([
      { name: EmailConnection.name, schema: EmailConnectionSchema },
      { name: EmailOAuthState.name, schema: EmailOAuthStateSchema },
      { name: EmailDraft.name, schema: EmailDraftSchema },
      { name: User.name, schema: UserSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PlatformMeeting.name, schema: PlatformMeetingSchema },
      { name: ManagedCalendarEvent.name, schema: ManagedCalendarEventSchema },
    ]),
  ],
  controllers: [EmailConnectionsController, EmailDraftsController],
  providers: [
    EmailProviderClient,
    EmailConnectionsRepository,
    EmailConnectionsService,
    EmailDraftsRepository,
    EmailDraftsService,
  ],
  exports: [EmailConnectionsService, EmailDraftsService],
})
export class EmailModule {}
