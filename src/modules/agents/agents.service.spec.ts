import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AiJobsQueue } from '../ai-integration/ai-jobs.queue';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';

describe('AgentsService', () => {
  const agentId = '66cc9bdfa847ea856c7b41a1';
  const repository = {
    create: jest.fn(),
    findByNameKey: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn(),
    disableById: jest.fn(),
    listForSync: jest.fn(),
  };
  const aiJobs = { enqueueAgentSync: jest.fn() };
  let service: AgentsService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findByNameKey.mockResolvedValue(null);
    aiJobs.enqueueAgentSync.mockResolvedValue({ queued: true });
    service = new AgentsService(
      repository as unknown as AgentsRepository,
      aiJobs as unknown as AiJobsQueue,
    );
  });

  it('creates an active agent and queues an upsert event', async () => {
    repository.create.mockResolvedValue({
      _id: agentId,
      name: 'Layla',
      nameKey: 'layla',
      type: AgentType.OPERATIONS,
      status: AgentStatus.ACTIVE,
      version: 1,
    });

    await service.create({
      name: 'Layla',
      type: AgentType.OPERATIONS,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nameKey: 'layla',
        status: AgentStatus.ACTIVE,
        version: 1,
      }),
    );
    expect(aiJobs.enqueueAgentSync).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `agent-${agentId}-v1`,
        eventType: 'AGENT_UPSERTED',
        agent: expect.objectContaining({
          id: agentId,
          status: AgentStatus.ACTIVE,
        }),
      }),
    );
  });

  it('soft-disables an agent and keeps its MongoDB identity', async () => {
    repository.findById.mockResolvedValue({
      _id: agentId,
      name: 'Layla',
      type: AgentType.OPERATIONS,
      status: AgentStatus.ACTIVE,
      version: 1,
    });
    repository.disableById.mockResolvedValue({
      _id: agentId,
      name: 'Layla',
      type: AgentType.OPERATIONS,
      status: AgentStatus.DISABLED,
      version: 2,
    });

    await expect(service.remove(agentId)).resolves.toEqual({
      id: agentId,
      status: AgentStatus.DISABLED,
      disabled: true,
    });
    expect(repository.disableById).toHaveBeenCalledWith(agentId);
    expect(aiJobs.enqueueAgentSync).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `agent-${agentId}-v2`,
        eventType: 'AGENT_DISABLED',
      }),
    );
  });

  it('reactivates the same agent through update and queues activation', async () => {
    repository.findById.mockResolvedValue({
      _id: agentId,
      name: 'Layla',
      type: AgentType.OPERATIONS,
      status: AgentStatus.DISABLED,
      version: 2,
    });
    repository.updateById.mockResolvedValue({
      _id: agentId,
      name: 'Layla',
      type: AgentType.OPERATIONS,
      status: AgentStatus.ACTIVE,
      version: 3,
    });

    await service.update(agentId, {
      status: AgentStatus.ACTIVE,
    });

    expect(aiJobs.enqueueAgentSync).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `agent-${agentId}-v3`,
        eventType: 'AGENT_ACTIVATED',
      }),
    );
  });

  it('returns an opaque cursor for the next catalog page', async () => {
    const nextAgentId = '66cc9bdfa847ea856c7b41a2';
    repository.listForSync.mockResolvedValue([
      {
        _id: agentId,
        name: 'Layla',
        type: AgentType.OPERATIONS,
        status: AgentStatus.ACTIVE,
        version: 1,
      },
      {
        _id: nextAgentId,
        name: 'Stitch',
        type: AgentType.SALES,
        status: AgentStatus.ACTIVE,
        version: 1,
      },
    ]);

    const result = await service.listCatalog({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: agentId, version: 1 }),
    );
    expect(result.nextCursor).toBe(Buffer.from(agentId).toString('base64url'));
  });
});
