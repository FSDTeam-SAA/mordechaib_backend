import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContactEnquiry,
  ContactEnquirySchema,
} from '../../database/schemas/contact-enquiry.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ContactEnquiriesAdminController } from './contact-enquiries-admin.controller';
import { ContactEnquiriesController } from './contact-enquiries.controller';
import { ContactEnquiriesRepository } from './contact-enquiries.repository';
import { ContactEnquiriesService } from './contact-enquiries.service';

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: ContactEnquiry.name, schema: ContactEnquirySchema },
    ]),
  ],
  controllers: [ContactEnquiriesController, ContactEnquiriesAdminController],
  providers: [ContactEnquiriesRepository, ContactEnquiriesService],
  exports: [ContactEnquiriesService],
})
export class ContactEnquiriesModule {}
