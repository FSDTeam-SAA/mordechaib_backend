import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StripeModule } from '../stripe/stripe.module';
import { AddonProductsController } from './addon-products.controller';
import { AddonProductsRepository } from './addon-products.repository';
import { AddonProductsService } from './addon-products.service';

@Module({
  imports: [StripeModule, AuthModule],
  controllers: [AddonProductsController],
  providers: [AddonProductsService, AddonProductsRepository],
  exports: [AddonProductsService],
})
export class AddonsModule {}
