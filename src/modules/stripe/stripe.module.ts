import { Module } from '@nestjs/common';
import { StripeProvider } from './stripe.provider';

@Module({
  providers: [StripeProvider],
  exports: [StripeProvider],
})

export class StripeModule {}