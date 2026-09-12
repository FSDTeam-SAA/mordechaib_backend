import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { Agent } from '../../database/schemas/agent.schema';

type AgentListFilters = {
  search?: string;
  type?: AgentType;
  status?: AgentStatus;
};

@Injectable()
export class AgentsRepository {
  constructor(@InjectModel(Agent.name) private readonly agents: Model<Agent>) {}

  create(
    input: Pick<Agent, 'name' | 'nameKey' | 'type' | 'status' | 'version'> & {
      imageUrl?: string;
    },
  ) {
    return this.agents.create(input);
  }

  async list(page: number, limit: number, filters: AgentListFilters) {
    const query: FilterQuery<Agent> = {};
    if (filters.type) query.type = filters.type;
    if (filters.status === AgentStatus.DISABLED) {
      query.status = AgentStatus.DISABLED;
    } else if (filters.status === AgentStatus.ACTIVE) {
      query.$or = [
        { status: AgentStatus.ACTIVE },
        { status: { $exists: false } },
      ];
    }
    if (filters.search) {
      query.name = { $regex: this.escapeRegex(filters.search), $options: 'i' };
    }

    const [items, total] = await Promise.all([
      this.agents
        .find(query)
        .sort({ nameKey: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.agents.countDocuments(query).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  findById(id: string) {
    return this.agents.findById(id).lean().exec();
  }

  findByNameKey(nameKey: string, excludeId?: string) {
    return this.agents
      .findOne({
        nameKey,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .lean()
      .exec();
  }

  updateById(id: string, update: Record<string, unknown>) {
    const activate = update.status === AgentStatus.ACTIVE;
    return this.agents
      .findOneAndUpdate(
        { _id: id },
        [
          {
            $set: {
              ...update,
              version: {
                $add: [{ $ifNull: ['$version', 1] }, 1],
              },
              ...(activate ? { disabledAt: '$$REMOVE' } : {}),
            },
          },
        ],
        { new: true },
      )
      .lean()
      .exec();
  }

  disableById(id: string) {
    return this.agents
      .findOneAndUpdate(
        {
          _id: id,
          status: { $ne: AgentStatus.DISABLED },
        },
        [
          {
            $set: {
              status: AgentStatus.DISABLED,
              disabledAt: new Date(),
              version: {
                $add: [{ $ifNull: ['$version', 1] }, 1],
              },
            },
          },
        ],
        { new: true },
      )
      .lean()
      .exec();
  }

  listForSync(afterId: string | undefined, limit: number) {
    return this.agents
      .find(afterId ? { _id: { $gt: afterId } } : {})
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean()
      .exec();
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
