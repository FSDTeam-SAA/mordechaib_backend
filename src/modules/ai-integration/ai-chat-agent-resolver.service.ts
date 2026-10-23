import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { Agent } from '../../database/schemas/agent.schema';
import { OrganizationAgentSettingsService } from '../organization-agent-settings/organization-agent-settings.service';
import { AiChatAgentIdentity } from './ai-chat.types';

@Injectable()
export class AiChatAgentResolver {
  constructor(
    @InjectModel(Agent.name) private readonly agents: Model<Agent>,
    private readonly settings: OrganizationAgentSettingsService,
  ) {}

  async resolve(
    organizationId: string,
    selectedAgentId?: string,
  ): Promise<AiChatAgentIdentity> {
    if (selectedAgentId && !isValidObjectId(selectedAgentId)) {
      throw new BadRequestException('Invalid selected agent id');
    }
    const candidates = await this.agents
      .find({
        ...(selectedAgentId ? { _id: selectedAgentId } : {}),
        $or: [{ status: AgentStatus.ACTIVE }, { status: { $exists: false } }],
      })
      .sort({
        type: 1,
        createdAt: 1,
        _id: 1,
      })
      .lean()
      .exec();
    const ordered = selectedAgentId
      ? candidates
      : [
          ...candidates.filter(
            (agent) => agent.type === AgentType.CHIEF_OF_STAFF,
          ),
          ...candidates.filter(
            (agent) => agent.type !== AgentType.CHIEF_OF_STAFF,
          ),
        ];
    const disabled = new Set(
      await this.settings.disabledAgentIds(
        organizationId,
        ordered.map((agent) => String(agent._id)),
      ),
    );
    const agent = ordered.find((item) => !disabled.has(String(item._id)));
    if (!agent) {
      throw new ServiceUnavailableException(
        selectedAgentId
          ? 'The selected agent is not active for this organization'
          : 'No active AI chat agent is available',
      );
    }
    return {
      id: String(agent._id),
      name: agent.name,
      type: agent.type,
      ...(agent.imageUrl ? { imageUrl: agent.imageUrl } : {}),
    };
  }
}
