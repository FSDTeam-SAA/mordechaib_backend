import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Organization,
  OrganizationSchema,
} from '../../database/schemas/organization.schema';
import {
  CallRecording,
  CallRecordingSchema,
} from '../../database/schemas/call-recording.schema';
import { AiJobsProcessor } from './ai-jobs.processor';
import { AI_JOBS_QUEUE, AiJobsQueue } from './ai-jobs.queue';
import { AiServiceClient } from './ai-service.client';
import { CallTranscriptionService } from './call-transcription.service';
import { AiActionsModule } from '../ai-actions/ai-actions.module';
import { AiSourceContextModule } from '../ai-internal/ai-internal.module';
import { AiActionClarificationsController } from './ai-action-clarifications.controller';
import { AiActionClarificationWorkflowService } from './ai-action-clarification-workflow.service';
import { Agent, AgentSchema } from '../../database/schemas/agent.schema';
import {
  Conversation,
  ConversationSchema,
} from '../../database/schemas/conversation.schema';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { AiAnalysisResponseValidator } from './ai-analysis-response.validator';
import { AiChatReplyService } from './ai-chat-reply.service';
import { AiTelemetryModule } from '../ai-telemetry/ai-telemetry.module';

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
    forwardRef(() => AiActionsModule),
    AiSourceContextModule,
    AiTelemetryModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: CallRecording.name, schema: CallRecordingSchema },
      { name: Agent.name, schema: AgentSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(
          config.get<string>('redis.url', 'redis://127.0.0.1:6379'),
        ),
      }),
    }),
    BullModule.registerQueue({ name: AI_JOBS_QUEUE }),
  ],
  providers: [
    AiServiceClient,
    AiJobsQueue,
    AiJobsProcessor,
    CallTranscriptionService,
    AiActionClarificationWorkflowService,
    AiAnalysisResponseValidator,
    AiChatReplyService,
  ],
  controllers: [AiActionClarificationsController],
  exports: [AiServiceClient, AiJobsQueue, AiActionClarificationWorkflowService],
})
export class AiIntegrationModule {}
