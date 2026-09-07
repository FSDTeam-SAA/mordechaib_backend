import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TaskItem,
  TaskItemSchema,
} from '../../database/schemas/task-item.schema';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskItem.name, schema: TaskItemSchema },
    ]),
  ],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
  exports: [TasksService],
})
export class TasksModule {}
