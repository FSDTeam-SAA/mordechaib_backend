import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { AiProposalAgent } from '../../database/schemas/ai-action-proposal.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksRepository } from './tasks.repository';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly repository: TasksRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateTaskDto) {
    const task = await this.repository.create({
      ...this.toPersistence(dto),
      organizationId,
      createdByUserId: userId,
    });

    return this.toResponse(task);
  }

  async createFromAiProposal(
    organizationId: string,
    userId: string,
    dto: CreateTaskDto,
    trace: {
      aiActionProposalId: string;
      proposedByAgent: AiProposalAgent;
    },
  ) {
    const existing = await this.repository.findByAiActionProposalId(
      organizationId,
      trace.aiActionProposalId,
    );
    if (existing) return this.toResponse(existing);

    try {
      const task = await this.repository.create({
        ...this.toPersistence(dto),
        organizationId,
        createdByUserId: userId,
        aiActionProposalId: trace.aiActionProposalId,
        proposedByAgent: trace.proposedByAgent,
      });
      return this.toResponse(task);
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      const raced = await this.repository.findByAiActionProposalId(
        organizationId,
        trace.aiActionProposalId,
      );
      if (!raced) throw error;
      return this.toResponse(raced);
    }
  }

  async findAll(organizationId: string, query: ListTasksQueryDto) {
    const dueFrom = query.dueFrom ? new Date(query.dueFrom) : undefined;
    const dueTo = query.dueTo ? new Date(query.dueTo) : undefined;
    if (dueFrom && dueTo && dueFrom > dueTo) {
      throw new BadRequestException('dueFrom must be before dueTo');
    }

    const result = await this.repository.list(
      organizationId,
      query.page,
      query.limit,
      {
        search: query.search?.trim(),
        status: query.status,
        priority: query.priority,
        department: query.department,
        assignedToUserId: query.assignedToUserId,
        dueFrom,
        dueTo,
      },
    );

    return {
      ...result,
      items: result.items.map((item) => this.toResponse(item)),
    };
  }

  async findOne(organizationId: string, id: string) {
    this.assertObjectId(id);
    const task = await this.repository.findById(organizationId, id);
    if (!task) throw new NotFoundException('Task not found');
    return this.toResponse(task);
  }

  async update(organizationId: string, id: string, dto: UpdateTaskDto) {
    this.assertObjectId(id);
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('No task changes were provided');
    }

    const previous =
      dto.status === TaskStatus.COMPLETED
        ? await this.repository.findById(organizationId, id)
        : undefined;
    const persistence = this.toPersistence(dto);
    if (previous && previous.status !== TaskStatus.COMPLETED) {
      persistence.completedAt = new Date();
    }
    const updated = await this.repository.updateById(
      organizationId,
      id,
      persistence,
    );
    if (!updated) throw new NotFoundException('Task not found');
    if (
      previous &&
      previous.status !== TaskStatus.COMPLETED &&
      updated.proposedByAgent &&
      updated.status === TaskStatus.COMPLETED
    ) {
      try {
        await this.notifications.notifyAgentTaskCompleted(updated);
      } catch (error) {
        this.logger.warn(
          `Task ${id} completed but its notification failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return this.toResponse(updated);
  }

  async remove(organizationId: string, id: string) {
    this.assertObjectId(id);
    const deleted = await this.repository.deleteById(organizationId, id);
    if (!deleted) throw new NotFoundException('Task not found');
    return { id, deleted: true };
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid task id');
  }

  private isDuplicateKey(error: unknown) {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    );
  }

  private toPersistence(dto: CreateTaskDto | UpdateTaskDto) {
    const input: Record<string, unknown> = { ...dto };

    if (dto.dueDate) input.dueDate = new Date(dto.dueDate);
    if (dto.subtasks) {
      input.subtasks = dto.subtasks.map((subtask) => ({
        ...subtask,
        ...(subtask.dueDate ? { dueDate: new Date(subtask.dueDate) } : {}),
      }));
    }
    if (dto.tags) input.tags = [...new Set(dto.tags.map((tag) => tag.trim()))];
    if (dto.stakeholderIds) {
      input.stakeholderIds = [...new Set(dto.stakeholderIds)];
    }

    return input;
  }

  private toResponse(task: TaskItem | Record<string, unknown>) {
    const record =
      'toObject' in task && typeof task.toObject === 'function'
        ? (task.toObject() as Record<string, unknown>)
        : (task as Record<string, unknown>);
    const { _id, __v, organizationId, ...response } = record;
    void __v;
    void organizationId;
    return { id: String(_id), ...response };
  }
}
