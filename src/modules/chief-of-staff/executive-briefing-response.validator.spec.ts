import { BadRequestException } from '@nestjs/common';
import {
  BriefingFactAvailability,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { ExecutiveBriefingAiRequest } from './executive-briefing.types';
import {
  EXECUTIVE_BRIEFING_SECTION_IDS,
  ExecutiveBriefingResponseValidator,
} from './executive-briefing-response.validator';

describe('ExecutiveBriefingResponseValidator', () => {
  const validator = new ExecutiveBriefingResponseValidator();
  const capturedAt = '2026-09-18T05:30:00.000Z';

  it('accepts a complete grounded briefing response', () => {
    const input = request();
    expect(validator.validate(response(input), input)).toEqual(response(input));
  });

  it('rejects a response with a missing stable section', () => {
    const input = request();
    const value = response(input);
    value.sections.pop();
    expect(() => validator.validate(value, input)).toThrow(BadRequestException);
  });

  it('rejects a metric that references an unknown fact', () => {
    const input = request();
    const value = response(input);
    value.headlineMetrics[0].sourceRefs = ['invented-fact'];
    expect(() => validator.validate(value, input)).toThrow(BadRequestException);
  });

  it('rejects an executable decision without a real proposal', () => {
    const input = request();
    const value = response(input);
    (value.sections[2].items as Array<Record<string, unknown>>).push({
      id: 'decision-1',
      label: 'Approve invented proposal',
      severity: 'HIGH',
      sourceRefs: ['task-1'],
      proposalId: 'invented-proposal-id',
      proposalAction: 'APPROVE',
      recommendationOnly: false,
    });
    expect(() => validator.validate(value, input)).toThrow(BadRequestException);
  });

  it('accepts an executable decision backed by a pending proposal', () => {
    const input = request();
    const value = response(input);
    value.sourceRefs.push({
      ref: 'proposal-1',
      sourceType: 'AI_ACTION_PROPOSAL',
      sourceId: 'proposal-db-1',
      capturedAt,
    });
    (value.sections[2].items as Array<Record<string, unknown>>).push({
      id: 'decision-1',
      label: 'Approve proposal',
      severity: 'HIGH',
      sourceRefs: ['proposal-1'],
      proposalId: 'proposal-db-1',
      proposalAction: 'APPROVE',
      recommendationOnly: false,
    });

    expect(() => validator.validate(value, input)).not.toThrow();
  });

  it('rejects executable fields on a recommendation-only item', () => {
    const input = request();
    const value = response(input);
    (value.sections[0].items as Array<Record<string, unknown>>).push({
      id: 'recommendation-1',
      label: 'Review the task',
      severity: 'INFO',
      sourceRefs: ['task-1'],
      recommendationOnly: true,
      proposalId: 'proposal-db-1',
    });

    expect(() => validator.validate(value, input)).toThrow(BadRequestException);
  });

  function request(): ExecutiveBriefingAiRequest {
    const unavailable = {
      availability: BriefingFactAvailability.UNAVAILABLE,
      items: [],
    };
    return {
      schemaVersion: '1.0',
      jobId: 'briefing-job-1',
      idempotencyKey: 'briefing-job-1-input',
      organizationId: 'org-1',
      briefingType: ExecutiveBriefingType.TODAY,
      period: {
        start: '2026-09-17T18:00:00.000Z',
        end: '2026-09-18T18:00:00.000Z',
        timezone: 'Asia/Dhaka',
      },
      requester: {
        userId: 'user-1',
        name: 'Rifat Hossain',
        language: 'en',
        scopeHash: 'scope-1',
      },
      organization: { name: 'Example Ltd.' },
      agents: [],
      facts: {
        tasks: {
          availability: BriefingFactAvailability.AVAILABLE,
          items: [
            {
              id: 'task-1',
              sourceType: 'TASK',
              sourceId: 'task-db-1',
              capturedAt,
              data: { title: 'Review quotation' },
            },
          ],
        },
        meetings: {
          availability: BriefingFactAvailability.AVAILABLE,
          items: [],
        },
        actionProposals: {
          availability: BriefingFactAvailability.AVAILABLE,
          items: [
            {
              id: 'proposal-1',
              sourceType: 'AI_ACTION_PROPOSAL',
              sourceId: 'proposal-db-1',
              capturedAt,
              data: { status: 'PENDING' },
            },
          ],
        },
        sourceAnalyses: {
          availability: BriefingFactAvailability.PARTIAL,
          items: [],
        },
        agentActivity: unavailable,
        sales: unavailable,
        customers: unavailable,
        support: unavailable,
        finance: unavailable,
        vendors: unavailable,
        marketing: unavailable,
        productDesign: unavailable,
        roi: unavailable,
        aiQuality: unavailable,
        strategicNotes: unavailable,
      },
      generatedAt: '2026-09-18T06:00:00.000Z',
    };
  }

  function response(input: ExecutiveBriefingAiRequest) {
    return {
      jobId: input.jobId,
      briefingType: input.briefingType,
      period: input.period,
      summary: 'One task needs attention.',
      trajectory: 'UNKNOWN',
      headlineMetrics: [
        {
          key: 'tasks_due',
          label: 'Tasks due',
          value: 1,
          unit: 'COUNT',
          direction: 'UNKNOWN',
          severity: 'INFO',
          sourceRefs: ['task-1'],
        },
      ],
      sections: EXECUTIVE_BRIEFING_SECTION_IDS[input.briefingType].map(
        (id) => ({
          id,
          title: id,
          kind: 'LIST',
          availability: 'AVAILABLE',
          summary: 'No additional items.',
          items: [],
        }),
      ),
      sourceRefs: [
        {
          ref: 'task-1',
          sourceType: 'TASK',
          sourceId: 'task-db-1',
          capturedAt,
        },
      ],
      confidence: 0.9,
    };
  }
});
