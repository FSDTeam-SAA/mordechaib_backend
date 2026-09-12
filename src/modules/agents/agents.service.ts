import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { AgentsRepository } from './agents.repository';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly repository: AgentsRepository) {}

  async create(organizationId: string, dto: CreateAgentDto) {
    const nameKey = this.nameKey(dto.name);
    await this.assertNameAvailable(organizationId, nameKey);
    try {
      return await this.repository.create({ ...dto, organizationId, nameKey });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('An agent with this name already exists');
      }
      throw error;
    }
  }

  list(organizationId: string, query: ListAgentsQueryDto) {
    return this.repository.list(organizationId, query.page, query.limit, {
      search: query.search,
      type: query.type,
    });
  }

  async get(organizationId: string, id: string) {
    this.assertObjectId(id);
    const agent = await this.repository.findById(organizationId, id);
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async update(organizationId: string, id: string, dto: UpdateAgentDto) {
    await this.get(organizationId, id);
    if (!Object.keys(dto).length) {
      throw new BadRequestException('No changes were provided');
    }

    const update: Record<string, unknown> = { ...dto };
    if (dto.name !== undefined) {
      const nameKey = this.nameKey(dto.name);
      await this.assertNameAvailable(organizationId, nameKey, id);
      update.nameKey = nameKey;
    }
    const agent = await this.repository.updateById(organizationId, id, update);
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async remove(organizationId: string, id: string) {
    this.assertObjectId(id);
    const deleted = await this.repository.deleteById(organizationId, id);
    if (!deleted) throw new NotFoundException('Agent not found');
    return { id, deleted: true };
  }

  private async assertNameAvailable(
    organizationId: string,
    nameKey: string,
    excludeId?: string,
  ) {
    const existing = await this.repository.findByNameKey(
      organizationId,
      nameKey,
      excludeId,
    );
    if (existing) {
      throw new ConflictException('An agent with this name already exists');
    }
  }

  private nameKey(name: string) {
    return name.trim().toLocaleLowerCase();
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid agent id');
  }

  private isDuplicateKey(error: unknown) {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
  }
}
