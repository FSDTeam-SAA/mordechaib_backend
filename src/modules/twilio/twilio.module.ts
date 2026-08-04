import { forwardRef, Module } from '@nestjs/common';
import { CallsModule } from '../calls/calls.module';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { RecordingStorageService } from './providers/recording-storage.service';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioSettingsController } from './twilio-settings.controller';
import { TwilioSettingsRepository } from './twilio-settings.repository';
import { TwilioSettingsService } from './twilio-settings.service';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';

@Module({
  imports: [forwardRef(() => CallsModule)],
  controllers: [TwilioController, TwilioSettingsController],
  providers: [
    TwilioService,
    TwilioProvider,
    RecordingStorageService,
    TwilioSettingsService,
    TwilioSettingsRepository,
    TwilioSignatureGuard,
  ],
  exports: [TwilioService, TwilioSettingsService, RecordingStorageService],
})
export class TwilioModule {}
