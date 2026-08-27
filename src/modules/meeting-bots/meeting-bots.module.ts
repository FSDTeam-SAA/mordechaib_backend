import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleMeetingsController } from './google-meetings.controller';
import { RecallSignatureGuard } from './guards/recall-signature.guard';
import { MeetingBotsController } from './meeting-bots.controller';
import { MeetingBotsProcessor } from './meeting-bots.processor';
import { RECALL_MEETINGS_QUEUE, MeetingBotsQueue } from './meeting-bots.queue';
import { MeetingBotsRepository } from './meeting-bots.repository';
import { MeetingBotsService } from './meeting-bots.service';
import { RecallApiClient } from './providers/recall-api.client';
import { RecallMeetingProvider } from './providers/recall-meeting.provider';
import { RecallZoomAuthProvider } from './providers/recall-zoom-auth.provider';
import { RecallSignatureService } from './recall-signature.service';
import { RecallWebhookController } from './recall-webhook.controller';
import { MEETING_AUDIO_STORAGE } from './storage/meeting-audio-storage.interface';
import { RecallAudioStorage } from './storage/recall-audio.storage';
import { ZoomAuthService } from './zoom-auth.service';
import { ZoomConnectionsRepository } from './zoom-connections.repository';
import { ZoomMeetingsController } from './zoom-meetings.controller';

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
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(
          config.get<string>('redis.url', 'redis://127.0.0.1:6379'),
        ),
      }),
    }),
    BullModule.registerQueue({ name: RECALL_MEETINGS_QUEUE }),
  ],
  controllers: [
    MeetingBotsController,
    GoogleMeetingsController,
    ZoomMeetingsController,
    RecallWebhookController,
  ],
  providers: [
    MeetingBotsService,
    MeetingBotsRepository,
    MeetingBotsQueue,
    MeetingBotsProcessor,
    RecallApiClient,
    RecallMeetingProvider,
    RecallZoomAuthProvider,
    ZoomAuthService,
    ZoomConnectionsRepository,
    RecallSignatureService,
    RecallSignatureGuard,
    RecallAudioStorage,
    { provide: MEETING_AUDIO_STORAGE, useExisting: RecallAudioStorage },
  ],
  exports: [MeetingBotsService],
})
export class MeetingBotsModule {}
