import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CustomerContact,
  CustomerContactSchema,
} from '../../database/schemas/customer-contact.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import {
  CustomerHealthSnapshot,
  CustomerHealthSnapshotSchema,
} from '../../database/schemas/customer-health-snapshot.schema';

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: CustomerContact.name, schema: CustomerContactSchema },
      {
        name: CustomerHealthSnapshot.name,
        schema: CustomerHealthSnapshotSchema,
      },
    ]),
  ],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRepository],
  exports: [ContactsService],
})
export class ContactsModule {}
