import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { TaskDepartment } from '../../common/enums/task-department.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TaskItem } from '../../database/schemas/task-item.schema';

export type TaskListFilters = {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  department?: TaskDepartment;
  assignedToUserId?: string;
  dueFrom?: Date;
  dueTo?: Date;
};

@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(TaskItem.name)
    private readonly taskModel: Model<TaskItem>,
  ) {}

  create(input: Record<string, unknown>) {
    return this.taskModel.create(input);
  }

  async list(
    organizationId: string,
    page: number,
    limit: number,
    filters: TaskListFilters,
  ) {
    const filter: FilterQuery<TaskItem> = { organizationId };

    if (filters.search) {
      const search = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }
    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.department) filter.department = filters.department;
    if (filters.assignedToUserId) {
      filter.assignedToUserId = filters.assignedToUserId;
    }
    if (filters.dueFrom || filters.dueTo) {
      filter.dueDate = {
        ...(filters.dueFrom ? { $gte: filters.dueFrom } : {}),
        ...(filters.dueTo ? { $lte: filters.dueTo } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.taskModel
        .find(filter)
        .sort({ dueDate: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.taskModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  findById(organizationId: string, id: string) {
    return this.taskModel.findOne({ _id: id, organizationId }).lean().exec();
  }

  updateById(
    organizationId: string,
    id: string,
    update: Record<string, unknown>,
  ) {
    return this.taskModel
      .findOneAndUpdate({ _id: id, organizationId }, update, {
        new: true,
        runValidators: true,
      })
      .lean()
      .exec();
  }

  deleteById(organizationId: string, id: string) {
    return this.taskModel
      .findOneAndDelete({ _id: id, organizationId })
      .lean()
      .exec();
  }
}
