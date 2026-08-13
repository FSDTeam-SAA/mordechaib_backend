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
import { AuthSession, AuthSessionSchema } from '../schemas/auth-session.schema';
import { AuthToken, AuthTokenSchema } from '../schemas/auth-token.schema';
import {
  PackageInquiry,
  PackageInquirySchema,
} from '../schemas/package-inquiry.schema';
import {
  CallRecording,
  CallRecordingSchema,
} from '../schemas/call-recording.schema';
import {
  TwilioSetting,
  TwilioSettingSchema,
} from '../schemas/twilio-setting.schema';
import {
  OnboardingSetup,
  OnboardingSetupSchema,
} from '../schemas/onboarding-setup.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanSchema,
} from '../schemas/subscription-plan.schema';
import {
  OrganizationSubscription,
  OrganizationSubscriptionSchema,
} from '../schemas/organization-subscription.schema';
import {
  RevenueSnapshot,
  RevenueSnapshotSchema,
} from '../schemas/revenue-snapshot.schema';
import { Invoice, InvoiceSchema } from '../schemas/invoice.schema';
import {
  CancellationRequest,
  CancellationRequestSchema,
} from '../schemas/cancellation-request.schema';

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
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: AuthToken.name, schema: AuthTokenSchema },
      { name: PackageInquiry.name, schema: PackageInquirySchema },
      { name: CallRecording.name, schema: CallRecordingSchema },
      { name: TwilioSetting.name, schema: TwilioSettingSchema },
      { name: OnboardingSetup.name, schema: OnboardingSetupSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: RevenueSnapshot.name, schema: RevenueSnapshotSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: CancellationRequest.name, schema: CancellationRequestSchema },
      {
        name: OrganizationSubscription.name,
        schema: OrganizationSubscriptionSchema,
      },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
