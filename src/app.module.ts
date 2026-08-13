import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { DatabaseModule } from './database/mongoose/mongoose.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { TwilioModule } from './modules/twilio/twilio.module';
import { CallsModule } from './modules/calls/calls.module';
import { AiModule } from './modules/ai/ai.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { CrmModule } from './modules/crm/crm.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsageModule } from './modules/usage/usage.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { PackageInquiriesModule } from './modules/package-inquiries/package-inquiries.module';
import { OnboardingSetupsModule } from './modules/onboarding-setups/onboarding-setups.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    IntegrationsModule,
    TwilioModule,
    CallsModule,
    AiModule,
    ApprovalsModule,
    CrmModule,
    CalendarModule,
    TasksModule,
    UsageModule,
    BillingModule,
    SubscriptionsModule,
    AuditLogsModule,
    PackageInquiriesModule,
    OnboardingSetupsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})

export class AppModule {}