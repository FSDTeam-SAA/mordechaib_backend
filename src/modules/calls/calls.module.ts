import { forwardRef, Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallsRepository } from './calls.repository';
import { TwilioModule } from '../twilio/twilio.module';
import { CallRecordsService } from './call-records.service';

@Module({
  imports: [forwardRef(() => TwilioModule)],
  controllers: [CallsController],
  providers: [CallsService, CallRecordsService, CallsRepository],
  exports: [CallsService, CallRecordsService],
})
export class CallsModule {}
