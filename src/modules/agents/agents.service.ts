import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { Agent } from '../../database/schemas/agent.schema';
import {
  AgentSyncEvent,
  AgentSyncEventType,
  AiJobsQueue,
} from '../ai-integration/ai-jobs.queue';
import { AgentsRepository } from './agents.repository';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentCatalogQueryDto } from './dto/list-agent-catalog-query.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

type StoredAgent = Agent & {
  _id: unknown;
  status?: AgentStatus;
  version?: number;
  updatedAt?: Date;
};

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly repository: AgentsRepository,
    private readonly aiJobs: AiJobsQueue,
  ) {}

  async create(dto: CreateAgentDto) {
    const nameKey = this.nameKey(dto.name);
    await this.assertNameAvailable(nameKey);
    try {
      const agent = await this.repository.create({
        ...dto,
        nameKey,
        status: AgentStatus.ACTIVE,
        version: 1,
      });
      await this.notifyAi(agent as unknown as StoredAgent, 'AGENT_UPSERTED');
      return agent;
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('An agent with this name already exists');
      }
      throw error;
    }
  }

  async list(query: ListAgentsQueryDto) {
    const result = await this.repository.list(query.page, query.limit, {
      search: query.search,
      type: query.type,
      status: query.status,
    });
    return {
      ...result,
      items: result.items.map((agent) => this.withLifecycleDefaults(agent)),
    };
  }

  async listCatalog(query: ListAgentCatalogQueryDto) {
    const afterId = this.decodeCursor(query.cursor);
    const records = await this.repository.listForSync(afterId, query.limit);
    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit) as unknown as StoredAgent[];
    const last = page.at(-1);
    return {
      items: page.map((agent) => this.catalogAgent(agent)),
      nextCursor: hasMore && last ? this.encodeCursor(String(last._id)) : null,
    };
  }

  async get(id: string, includeDisabled = true) {
    this.assertObjectId(id);
    const agent = await this.repository.findById(id);
    if (!agent) throw new NotFoundException('Agent not found');
    const normalized = this.withLifecycleDefaults(agent);
    if (!includeDisabled && normalized.status === AgentStatus.DISABLED) {
      throw new NotFoundException('Agent not found');
    }
    return normalized;
  }

  async update(id: string, dto: UpdateAgentDto) {
    const current = (await this.get(id)) as unknown as StoredAgent;
    if (!Object.keys(dto).length) {
      throw new BadRequestException('No changes were provided');
    }

    const update: Record<string, unknown> = { ...dto };
    if (dto.name !== undefined) {
      const nameKey = this.nameKey(dto.name);
      await this.assertNameAvailable(nameKey, id);
      update.nameKey = nameKey;
    }
    if (dto.status === AgentStatus.DISABLED) {
      update.disabledAt = new Date();
    }
    let agent;
    try {
      agent = await this.repository.updateById(id, update);
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('An agent with this name already exists');
      }
      throw error;
    }
    if (!agent) throw new NotFoundException('Agent not found');
    const next = agent as unknown as StoredAgent;
    const previousStatus = current.status || AgentStatus.ACTIVE;
    const nextStatus = next.status || AgentStatus.ACTIVE;
    const eventType: AgentSyncEventType =
      previousStatus !== nextStatus
        ? nextStatus === AgentStatus.DISABLED
          ? 'AGENT_DISABLED'
          : 'AGENT_ACTIVATED'
        : 'AGENT_UPSERTED';
    await this.notifyAi(next, eventType);
    return agent;
  }

  async remove(id: string) {
    this.assertObjectId(id);
    const current = (await this.repository.findById(
      id,
    )) as unknown as StoredAgent | null;
    if (!current) throw new NotFoundException('Agent not found');
    if (current.status === AgentStatus.DISABLED) {
      return { id, status: AgentStatus.DISABLED, disabled: true };
    }
    const disabled = await this.repository.disableById(id);
    if (!disabled) throw new NotFoundException('Agent not found');
    await this.notifyAi(disabled as unknown as StoredAgent, 'AGENT_DISABLED');
    return { id, status: AgentStatus.DISABLED, disabled: true };
  }

  private async assertNameAvailable(nameKey: string, excludeId?: string) {
    const existing = await this.repository.findByNameKey(nameKey, excludeId);
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
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    );
  }

  private catalogAgent(agent: StoredAgent) {
    return {
      id: String(agent._id),
      name: agent.name,
      ...(agent.imageUrl ? { imageUrl: agent.imageUrl } : {}),
      type: agent.type,
      status: agent.status || AgentStatus.ACTIVE,
      version: agent.version || 1,
      ...(agent.updatedAt ? { updatedAt: agent.updatedAt.toISOString() } : {}),
    };
  }

  private withLifecycleDefaults<
    T extends { status?: AgentStatus; version?: number },
  >(agent: T) {
    return {
      ...agent,
      status: agent.status || AgentStatus.ACTIVE,
      version: agent.version || 1,
    };
  }

  private async notifyAi(agent: StoredAgent, eventType: AgentSyncEventType) {
    const snapshot = this.catalogAgent(agent);
    const event: AgentSyncEvent = {
      schemaVersion: '1.0',
      eventId: `agent-${snapshot.id}-v${snapshot.version}`,
      eventType,
      agent: {
        id: snapshot.id,
        name: snapshot.name,
        ...(snapshot.imageUrl ? { imageUrl: snapshot.imageUrl } : {}),
        type: snapshot.type as AgentType,
        status: snapshot.status,
        version: snapshot.version,
      },
      occurredAt: new Date().toISOString(),
    };
    try {
      await this.aiJobs.enqueueAgentSync(event);
    } catch (error) {
      // Catalog bootstrap/reconciliation repairs missed events. Agent CRUD must
      // remain available when Redis or the AI service is temporarily down.
      this.logger.warn(
        `Agent ${snapshot.id} was saved but its AI sync event was not queued: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private encodeCursor(id: string) {
    return Buffer.from(id, 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string) {
    if (!cursor) return undefined;
    try {
      const id = Buffer.from(cursor, 'base64url').toString('utf8');
      if (!isValidObjectId(id)) throw new Error('invalid id');
      return id;
    } catch {
      throw new BadRequestException('Invalid agent catalog cursor');
    }
  }
}
