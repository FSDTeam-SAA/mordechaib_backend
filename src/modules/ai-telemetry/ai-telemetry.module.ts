import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AgentActivity,
  AgentActivitySchema,
} from '../../database/schemas/agent-activity.schema';
import { AgentActivityService } from './agent-activity.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentActivity.name, schema: AgentActivitySchema },
    ]),
  ],
  providers: [AgentActivityService],
  exports: [AgentActivityService],
})
export class AiTelemetryModule {}
