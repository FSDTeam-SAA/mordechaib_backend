import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TaskAttachmentKind } from '../../common/enums/task-attachment-kind.enum';
import { TaskDepartment } from '../../common/enums/task-department.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import {
  AiActionProposal,
  AiProposalAgent,
  AiProposalAgentSchema,
} from './ai-action-proposal.schema';

export type TaskItemDocument = HydratedDocument<TaskItem>;

@Schema({ _id: false })
export class TaskDependency {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ default: false })
  isComplete!: boolean;
}

export const TaskDependencySchema =
  SchemaFactory.createForClass(TaskDependency);

@Schema({ _id: false })
export class TaskAttachment {
  @Prop({ required: true, trim: true, maxlength: 255 })
  name!: string;

  @Prop({ required: true, trim: true })
  url!: string;

  @Prop({
    enum: Object.values(TaskAttachmentKind),
    default: TaskAttachmentKind.FILE,
  })
  kind!: TaskAttachmentKind;

  @Prop({ trim: true, maxlength: 120 })
  mimeType?: string;

  @Prop({ min: 0 })
  sizeBytes?: number;
}

export const TaskAttachmentSchema =
  SchemaFactory.createForClass(TaskAttachment);

@Schema({ _id: false })
export class RequiredTaskAttachment {
  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ default: false })
  isComplete!: boolean;
}

export const RequiredTaskAttachmentSchema = SchemaFactory.createForClass(
  RequiredTaskAttachment,
);

@Schema({ _id: false })
export class TaskAiAssistance {
  @Prop({ default: false })
  generateChecklist!: boolean;

  @Prop({ default: false })
  suggestNextSteps!: boolean;

  @Prop({ default: false })
  recommendDeadline!: boolean;

  @Prop({ default: false })
  autoCreateSubtasks!: boolean;
}

export const TaskAiAssistanceSchema =
  SchemaFactory.createForClass(TaskAiAssistance);

@Schema({ _id: false })
export class TaskReminder {
  @Prop({ default: false })
  enabled!: boolean;

  @Prop({ min: 0, max: 40320 })
  minutesBeforeDue?: number;
}

export const TaskReminderSchema = SchemaFactory.createForClass(TaskReminder);

@Schema({ _id: false })
export class TaskSubtask {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ default: false })
  isComplete!: boolean;

  @Prop()
  dueDate?: Date;
}

export const TaskSubtaskSchema = SchemaFactory.createForClass(TaskSubtask);

@Schema({ timestamps: true, collection: 'tasks' })
export class TaskItem {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ maxlength: 10000 })
  description?: string;

  @Prop({ trim: true })
  assignedToUserId?: string;

  @Prop({ enum: Object.values(TaskDepartment) })
  department?: TaskDepartment;

  @Prop({ enum: Object.values(TaskPriority), default: TaskPriority.MEDIUM })
  priority!: TaskPriority;

  @Prop({
    enum: Object.values(TaskStatus),
    default: TaskStatus.TODO,
    index: true,
  })
  status!: TaskStatus;

  @Prop({ index: true })
  completedAt?: Date;

  @Prop()
  dueDate?: Date;

  @Prop({ min: 0, max: 525600 })
  estimatedDurationMinutes?: number;

  @Prop({ type: [String], default: [] })
  stakeholderIds!: string[];

  @Prop({ type: [TaskDependencySchema], default: [] })
  dependencies!: TaskDependency[];

  @Prop({ type: [TaskAttachmentSchema], default: [] })
  attachments!: TaskAttachment[];

  @Prop({ type: [RequiredTaskAttachmentSchema], default: [] })
  requiredAttachments!: RequiredTaskAttachment[];

  @Prop({ type: TaskAiAssistanceSchema, default: {} })
  aiAssistance!: TaskAiAssistance;

  @Prop({ type: TaskReminderSchema, default: {} })
  reminder!: TaskReminder;

  @Prop({ type: [TaskSubtaskSchema], default: [] })
  subtasks!: TaskSubtask[];

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ ref: AiActionProposal.name, index: true })
  aiActionProposalId?: string;

  @Prop({ type: AiProposalAgentSchema })
  proposedByAgent?: AiProposalAgent;
}

export const TaskItemSchema = SchemaFactory.createForClass(TaskItem);
TaskItemSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
TaskItemSchema.index({ organizationId: 1, assignedToUserId: 1, createdAt: -1 });
TaskItemSchema.index(
  { organizationId: 1, aiActionProposalId: 1 },
  {
    unique: true,
    partialFilterExpression: { aiActionProposalId: { $type: 'string' } },
  },
);
