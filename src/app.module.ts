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
import { AddonsModule } from './modules/addons/addons.module';
import { MetaModule } from './modules/meta/meta.module';
import { MeetingBotsModule } from './modules/meeting-bots/meeting-bots.module';
import { TeamModule } from './modules/team/team.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AiActionsModule } from './modules/ai-actions/ai-actions.module';
import { AiIntegrationModule } from './modules/ai-integration/ai-integration.module';
import { AgentsModule } from './modules/agents/agents.module';
import { CallIntelligenceModule } from './modules/call-intelligence/call-intelligence.module';
import { ChiefOfStaffModule } from './modules/chief-of-staff/chief-of-staff.module';
import { SetupPackagesModule } from './modules/setup-packages/setup-packages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizerDashboardModule } from './modules/organizer-dashboard/organizer-dashboard.module';
import { EmailModule } from './modules/email/email.module';
import { SupportRequestsModule } from './modules/support-requests/support-requests.module';

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
    ApprovalsModule,
    CrmModule,
    CalendarModule,
    TasksModule,
    UsageModule,
    BillingModule,
    SubscriptionsModule,
    AddonsModule,
    AuditLogsModule,
    PackageInquiriesModule,
    OnboardingSetupsModule,
    MetaModule,
    MeetingBotsModule,
    TeamModule,
    MessagesModule,
    SettingsModule,
    AiActionsModule,
    AiIntegrationModule,
    AgentsModule,
    CallIntelligenceModule,
    ChiefOfStaffModule,
    SetupPackagesModule,
    NotificationsModule,
    OrganizerDashboardModule,
    EmailModule,
    SupportRequestsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
