import { BadRequestException } from '@nestjs/common';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { ChiefOfStaffInsightsService } from './chief-of-staff-insights.service';

describe('ChiefOfStaffInsightsService', () => {
  const activity = {
    list: jest.fn().mockResolvedValue([]),
    healthSnapshot: jest.fn().mockResolvedValue({ totalRuns: 0 }),
  };
  const service = new ChiefOfStaffInsightsService(
    activity as unknown as AgentActivityService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('uses the requested bounded range for AI health', async () => {
    await service.aiHealth('org-1', {
      from: '2026-09-17T00:00:00.000Z',
      to: '2026-09-18T00:00:00.000Z',
    });

    expect(activity.healthSnapshot).toHaveBeenCalledWith('org-1', {
      from: new Date('2026-09-17T00:00:00.000Z'),
      to: new Date('2026-09-18T00:00:00.000Z'),
    });
  });

  it('rejects a range longer than 90 days', () => {
    expect(() =>
      service.aiHealth('org-1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-09-18T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });
});
