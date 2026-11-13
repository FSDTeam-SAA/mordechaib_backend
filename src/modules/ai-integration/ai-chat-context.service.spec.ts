import { AgentType } from '../../common/enums/agent-type.enum';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { AiChatAgentResolver } from './ai-chat-agent-resolver.service';
import { AiChatContextService } from './ai-chat-context.service';

describe('AiChatContextService', () => {
  const organizationId = '66cc9bdfa847ea856c7b41d2';
  const requesterUserId = '66cc9bdfa847ea856c7b41f1';
  const messageId = '66cc9bdfa847ea856c7b41d4';
  const sourceContext = {
    sourceContext: jest.fn(),
    organizationContext: jest.fn(),
    requireActiveRequester: jest.fn(),
  };
  const agents = { resolve: jest.fn() };
  let service: AiChatContextService;

  beforeEach(() => {
    jest.resetAllMocks();
    sourceContext.sourceContext.mockResolvedValue({
      organizationId,
      requesterUserId,
      message: {
        id: messageId,
        senderType: 'USER',
        content: 'Schedule a customer meeting',
        createdAt: '2026-11-13T06:00:00.000Z',
      },
      conversation: {
        id: '66cc9bdfa847ea856c7b41d3',
        title: 'New Chat',
        totalMessageCount: 1,
        selectedAgentId: '66cc9bdfa847ea856c7b41a1',
        history: [
          {
            id: messageId,
            senderType: 'USER',
            content: 'Schedule a customer meeting',
            createdAt: '2026-11-13T06:00:00.000Z',
          },
        ],
      },
      attachments: [],
      pendingProposals: [],
    });
    sourceContext.organizationContext.mockResolvedValue({
      organizationId,
      timezone: 'UTC',
      language: 'en',
    });
    sourceContext.requireActiveRequester.mockResolvedValue({
      userId: requesterUserId,
      name: 'Test Organizer',
      timezone: 'Asia/Dhaka',
      language: 'bn',
      status: 'ACTIVE',
    });
    agents.resolve.mockResolvedValue({
      id: '66cc9bdfa847ea856c7b41a1',
      name: 'Laura',
      type: AgentType.CHIEF_OF_STAFF,
    });
    service = new AiChatContextService(
      sourceContext as unknown as AiSourceContextService,
      agents as unknown as AiChatAgentResolver,
    );
  });

  it('derives the AI requester from the persisted message sender', async () => {
    const result = await service.build(organizationId, messageId);

    expect(sourceContext.requireActiveRequester).toHaveBeenCalledWith(
      organizationId,
      requesterUserId,
    );
    expect(result.request.requester).toEqual({
      userId: requesterUserId,
      name: 'Test Organizer',
    });
    expect(result.request.context).toEqual(
      expect.objectContaining({
        effectiveTimezone: 'Asia/Dhaka',
        language: 'bn',
      }),
    );
  });

  it('does not accept requester identity as an independent caller input', async () => {
    await service.build(organizationId, messageId);

    expect(sourceContext.requireActiveRequester).toHaveBeenCalledTimes(1);
    expect(sourceContext.requireActiveRequester).toHaveBeenCalledWith(
      organizationId,
      requesterUserId,
    );
  });
});
