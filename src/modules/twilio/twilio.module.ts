import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CallsModule } from '../calls/calls.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StripeModule } from '../stripe/stripe.module';
import { UsersModule } from '../users/users.module';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { RecordingStorageService } from './providers/recording-storage.service';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioSettingsController } from './twilio-settings.controller';
import { TwilioSettingsRepository } from './twilio-settings.repository';
import { TwilioSettingsService } from './twilio-settings.service';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';
import { TwilioAccountsRepository } from './twilio-accounts.repository';
import { TwilioAccountsService } from './twilio-accounts.service';
import { TwilioEligibilityService } from './twilio-eligibility.service';
import { TwilioManagementController } from './twilio-management.controller';
import { TwilioPhoneNumbersRepository } from './twilio-phone-numbers.repository';
import { TwilioProvisioningProcessor } from './twilio-provisioning.processor';
import {
  TWILIO_PROVISIONING_QUEUE,
  TwilioProvisioningQueue,
} from './twilio-provisioning.queue';
import { TwilioProvisioningService } from './twilio-provisioning.service';
import { TwilioUsageRepository } from './twilio-usage.repository';
import { TwilioUsageService } from './twilio-usage.service';

function redisConnection(urlValue: string) {
  const url = new URL(urlValue);
  const database = url.pathname ? Number(url.pathname.slice(1) || 0) : 0;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isFinite(database) ? database : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CallsModule),
    OrganizationsModule,
    SubscriptionsModule,
    StripeModule,
    UsersModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(
          config.get<string>('redis.url', 'redis://127.0.0.1:6379'),
        ),
      }),
    }),
    BullModule.registerQueue({ name: TWILIO_PROVISIONING_QUEUE }),
  ],
  controllers: [
    TwilioController,
    TwilioSettingsController,
    TwilioManagementController,
  ],
  providers: [
    TwilioService,
    TwilioProvider,
    RecordingStorageService,
    TwilioSettingsService,
    TwilioSettingsRepository,
    TwilioAccountsRepository,
    TwilioAccountsService,
    TwilioPhoneNumbersRepository,
    TwilioEligibilityService,
    TwilioProvisioningQueue,
    TwilioProvisioningService,
    TwilioProvisioningProcessor,
    TwilioUsageRepository,
    TwilioUsageService,
    TwilioSignatureGuard,
  ],
  exports: [
    TwilioService,
    TwilioSettingsService,
    TwilioAccountsService,
    TwilioProvisioningService,
    RecordingStorageService,
  ],
})
export class TwilioModule {}
