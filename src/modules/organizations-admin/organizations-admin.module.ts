import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OrgTeamModule } from '../org-team/org-team.module';
import { PlatformOperationLeasesModule } from '../platform-operation-leases/platform-operation-leases.module';
import { StripeModule } from '../stripe/stripe.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { OrganizationsAdminController } from './organizations-admin.controller';
import { OrganizationsAdminService } from './organizations-admin.service';

@Module({
  imports: [
    AuditLogsModule,
    IntegrationsModule,
    OrgTeamModule,
    PlatformOperationLeasesModule,
    StripeModule,
    SubscriptionsModule,
  ],
  controllers: [OrganizationsAdminController],
  providers: [OrganizationsAdminService],
})
export class OrganizationsAdminModule {}
