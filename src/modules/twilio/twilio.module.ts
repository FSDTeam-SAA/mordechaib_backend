import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { TwilioProvider } from './providers/twilio.provider';

@Module({
  controllers: [TwilioController],
  providers: [TwilioService, TwilioProvider],
  exports: [TwilioService],
})
export class TwilioModule {}
