import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Organization,
  OrganizationSchema,
} from '../schemas/organization.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Integration, IntegrationSchema } from '../schemas/integration.schema';
import { CallLog, CallLogSchema } from '../schemas/call-log.schema';
import { Approval, ApprovalSchema } from '../schemas/approval.schema';
import { TaskItem, TaskItemSchema } from '../schemas/task-item.schema';
import { UsageRecord, UsageRecordSchema } from '../schemas/usage-record.schema';
import { AuditLog, AuditLogSchema } from '../schemas/audit-log.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('database.mongoUri'),
      }),
    }),
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
      { name: Integration.name, schema: IntegrationSchema },
      { name: CallLog.name, schema: CallLogSchema },
      { name: Approval.name, schema: ApprovalSchema },
      { name: TaskItem.name, schema: TaskItemSchema },
      { name: UsageRecord.name, schema: UsageRecordSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
