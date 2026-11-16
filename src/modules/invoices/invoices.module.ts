import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StripeModule } from '../stripe/stripe.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';
import { UserInvoicesController } from './user-invoices.controller';

@Module({
  imports: [SubscriptionsModule, OrganizationsModule, StripeModule],
  controllers: [InvoicesController, UserInvoicesController],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesService],
})

export class InvoicesModule {}
