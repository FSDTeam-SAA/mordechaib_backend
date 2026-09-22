import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import {
  GetAiInsightsQueryDto,
  ListAgentActivityQueryDto,
} from './dto/get-ai-insights-query.dto';

const MAX_INSIGHT_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class ChiefOfStaffInsightsService {
  constructor(private readonly activities: AgentActivityService) {}

  async listAgentActivity(
    organizationId: string,
    query: ListAgentActivityQueryDto,
  ) {
    const range = this.range(query);
    const items = await this.activities.list(
      organizationId,
      range,
      query.limit,
    );
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      items: items.map((item) => {
        const { _id, __v, organizationId: ignored, ...activity } = item;
        void __v;
        void ignored;
        return { id: String(_id), ...activity };
      }),
    };
  }

  aiHealth(organizationId: string, query: GetAiInsightsQueryDto) {
    return this.activities.healthSnapshot(organizationId, this.range(query));
  }

  private range(query: GetAiInsightsQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('from must be before to');
    }
    if (to.getTime() - from.getTime() > MAX_INSIGHT_RANGE_MS) {
      throw new BadRequestException('AI insight range cannot exceed 90 days');
    }
    return { from, to };
  }
}
