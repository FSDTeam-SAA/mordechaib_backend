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

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: CustomerContact.name, schema: CustomerContactSchema },
    ]),
  ],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRepository],
  exports: [ContactsService],
})
export class ContactsModule {}
