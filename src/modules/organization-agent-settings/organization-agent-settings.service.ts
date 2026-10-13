import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { Agent } from '../../database/schemas/agent.schema';
import { OrganizationAgentSetting } from '../../database/schemas/organization-agent-setting.schema';

export type OrganizationAgentSettingUpdate = {
  enabled?: boolean;
  concurrencyLimit?: number | null;
  approvalRequired?: boolean;
};

@Injectable()
export class OrganizationAgentSettingsService {
  constructor(
    @InjectModel(OrganizationAgentSetting.name)
    private readonly settings: Model<OrganizationAgentSetting>,
    @InjectModel(Agent.name)
    private readonly agents: Model<Agent>,
  ) {}

  list(organizationId: string, agentIds?: string[]) {
    return this.settings
      .find({
        organizationId,
        ...(agentIds ? { agentId: { $in: agentIds } } : {}),
      })
      .sort({ agentId: 1 })
      .lean()
      .exec();
  }

  async update(
    organizationId: string,
    agentId: string,
    updatedByUserId: string,
    update: OrganizationAgentSettingUpdate,
  ) {
    if (!isValidObjectId(agentId)) {
      throw new BadRequestException('Invalid agent id');
    }
    const agent = await this.agents
      .findOne({
        _id: agentId,
        $or: [{ status: AgentStatus.ACTIVE }, { status: { $exists: false } }],
      })
      .select('_id')
      .lean()
      .exec();
    if (!agent) throw new NotFoundException('Active agent not found');

    return this.settings
      .findOneAndUpdate(
        { organizationId, agentId },
        {
          $set: { ...update, updatedByUserId },
          $setOnInsert: { organizationId, agentId },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async policyContract(organizationId: string) {
    const settings = await this.list(organizationId);
    return {
      defaults: {
        enabled: true,
        approvalRequired: true,
        concurrencyLimit: null,
      },
      overrides: settings.map((setting) => ({
        agentId: setting.agentId,
        enabled: setting.enabled,
        approvalRequired: setting.approvalRequired,
        concurrencyLimit: setting.concurrencyLimit ?? null,
      })),
    };
  }

  async disabledAgentIds(organizationId: string, agentIds: string[]) {
    if (!agentIds.length) return [];
    const settings = await this.settings
      .find({ organizationId, agentId: { $in: agentIds }, enabled: false })
      .select('agentId')
      .lean()
      .exec();
    return settings.map((setting) => setting.agentId);
  }
}
