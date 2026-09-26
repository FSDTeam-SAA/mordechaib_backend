import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { StripeModule } from '../stripe/stripe.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { OrganizationsAdminController } from './organizations-admin.controller';
import { OrganizationsAdminService } from './organizations-admin.service';

@Module({
  imports: [
    AuditLogsModule,
    IntegrationsModule,
    StripeModule,
    SubscriptionsModule,
  ],
  controllers: [OrganizationsAdminController],
  providers: [OrganizationsAdminService],
})
export class OrganizationsAdminModule {}
