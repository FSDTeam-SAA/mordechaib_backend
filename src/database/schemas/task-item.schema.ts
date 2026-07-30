import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TaskItemDocument = HydratedDocument<TaskItem>;

@Schema({ timestamps: true, collection: 'tasks' })
export class TaskItem {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop()
  dueAt?: Date;

  @Prop({ default: 'OPEN', enum: ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] })
  status!: string;
}

export const TaskItemSchema = SchemaFactory.createForClass(TaskItem);
