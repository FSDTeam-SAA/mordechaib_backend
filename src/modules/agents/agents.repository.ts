import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { AgentType } from '../../common/enums/agent-type.enum';
import { Agent } from '../../database/schemas/agent.schema';

type AgentListFilters = {
  search?: string;
  type?: AgentType;
};

@Injectable()
export class AgentsRepository {
  constructor(@InjectModel(Agent.name) private readonly agents: Model<Agent>) {}

  create(
    input: Pick<Agent, 'organizationId' | 'name' | 'nameKey' | 'type'> & {
      imageUrl?: string;
    },
  ) {
    return this.agents.create(input);
  }

  async list(
    organizationId: string,
    page: number,
    limit: number,
    filters: AgentListFilters,
  ) {
    const query: FilterQuery<Agent> = { organizationId };
    if (filters.type) query.type = filters.type;
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

  findById(organizationId: string, id: string) {
    return this.agents.findOne({ _id: id, organizationId }).lean().exec();
  }

  findByNameKey(organizationId: string, nameKey: string, excludeId?: string) {
    return this.agents
      .findOne({
        organizationId,
        nameKey,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .lean()
      .exec();
  }

  updateById(
    organizationId: string,
    id: string,
    update: Record<string, unknown>,
  ) {
    return this.agents
      .findOneAndUpdate({ _id: id, organizationId }, update, { new: true })
      .lean()
      .exec();
  }

  deleteById(organizationId: string, id: string) {
    return this.agents
      .findOneAndDelete({ _id: id, organizationId })
      .lean()
      .exec();
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
