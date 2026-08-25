import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RecallSignatureGuard } from './guards/recall-signature.guard';
import { RecallZoomProvider } from './providers/recall-zoom.provider';
import { RecallWebhookController } from './recall-webhook.controller';
import { RecallSignatureService } from './recall-signature.service';
import { RECALL_ZOOM_QUEUE, ZoomMeetingsQueue } from './zoom-meetings.queue';
import { ZoomMeetingsController } from './zoom-meetings.controller';
import { ZoomMeetingsProcessor } from './zoom-meetings.processor';
import { ZoomMeetingsRepository } from './zoom-meetings.repository';
import { ZoomMeetingsService } from './zoom-meetings.service';

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
    BullModule.registerQueue({ name: RECALL_ZOOM_QUEUE }),
  ],
  controllers: [ZoomMeetingsController, RecallWebhookController],
  providers: [
    ZoomMeetingsService,
    ZoomMeetingsRepository,
    RecallZoomProvider,
    RecallSignatureService,
    RecallSignatureGuard,
    ZoomMeetingsQueue,
    ZoomMeetingsProcessor,
  ],
  exports: [ZoomMeetingsService],
})
export class ZoomMeetingsModule {}
