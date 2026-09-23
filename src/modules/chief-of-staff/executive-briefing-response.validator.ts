import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BriefingFactAvailability,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { ExecutiveBriefingAiRequest } from './executive-briefing.types';

const SECTION_IDS: Record<ExecutiveBriefingType, string[]> = {
  [ExecutiveBriefingType.TODAY]: [
    'primary_focus',
    'overnight_movements',
    'ceo_action_items',
    'pipeline_revenue',
    'client_health',
    'operational_status',
    'financial_pulse',
    'vendor_accountability',
    'marketing_growth',
    'design_status',
    'ceo_notes',
  ],
  [ExecutiveBriefingType.TEAM_CHALLENGES]: [
    'completed_milestones',
    'ceo_action_items',
    'next_day_decisions',
    'key_risks',
    'strategic_blockers',
    'financial_movements',
    'operational_metrics',
    'vendor_performance',
    'priority_alignment',
    'team_accountability',
    'escalations',
    'ceo_notes',
  ],
  [ExecutiveBriefingType.WEEKLY_REVIEW]: [
    'executive_summary',
    'roi_efficiency',
    'sales_revenue',
    'client_health',
    'delivery_milestones',
    'marketing_growth',
    'product_creative',
    'ai_system_health',
    'financial_movements',
    'vendor_performance',
    'strategic_shift',
    'ceo_notes',
  ],
};

const TRAJECTORIES = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN'];
const KINDS = [
  'TEXT',
  'LIST',
  'AGENT_CARDS',
  'DECISION_CARDS',
  'METRIC_GRID',
  'PROGRESS',
  'DONUT',
];
const DIRECTIONS = ['UP', 'DOWN', 'FLAT', 'UNKNOWN'];
const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const UNITS = [
  'COUNT',
  'PERCENT',
  'CURRENCY_USD',
  'MINUTES',
  'HOURS',
  'SCORE',
  'TEXT',
];
const PROPOSAL_ACTIONS = ['APPROVE', 'RETRY'];

@Injectable()
export class ExecutiveBriefingResponseValidator {
  validate(value: unknown, input: ExecutiveBriefingAiRequest) {
    if (!this.record(value)) this.invalid('AI briefing response is invalid');
    if (JSON.stringify(value).length > 1_000_000) {
      this.invalid('AI briefing response exceeds the size limit');
    }
    if (value.jobId !== input.jobId)
      this.invalid('Briefing jobId does not match');
    if (value.briefingType !== input.briefingType) {
      this.invalid('Briefing type does not match');
    }
    if (
      !this.record(value.period) ||
      value.period.start !== input.period.start ||
      value.period.end !== input.period.end ||
      value.period.timezone !== input.period.timezone
    ) {
      this.invalid('Briefing period does not match');
    }
    this.string(value.summary, 'summary', 4_000);
    this.oneOf(value.trajectory, TRAJECTORIES, 'trajectory');
    this.number(value.confidence, 'confidence', 0, 1);

    const submittedFacts = new Map<
      string,
      {
        sourceType: string;
        sourceId: string;
        capturedAt: string;
        availability: BriefingFactAvailability;
      }
    >();
    for (const group of Object.values(input.facts)) {
      for (const fact of group.items) {
        if (submittedFacts.has(fact.id)) {
          this.invalid(`Duplicate submitted fact id ${fact.id}`);
        }
        submittedFacts.set(fact.id, {
          ...fact,
          availability: group.availability,
        });
      }
    }
    const proposalStatuses = new Map(
      input.facts.actionProposals.items.map((fact) => [
        fact.sourceId,
        typeof fact.data.status === 'string' ? fact.data.status : undefined,
      ]),
    );
    const proposalFactIds = new Map(
      input.facts.actionProposals.items.map((fact) => [fact.sourceId, fact.id]),
    );
    const returnedRefs = this.validateReturnedRefs(
      value.sourceRefs,
      submittedFacts,
    );

    if (
      !Array.isArray(value.headlineMetrics) ||
      value.headlineMetrics.length > 50
    ) {
      this.invalid('headlineMetrics must contain at most 50 items');
    }
    for (const metric of value.headlineMetrics) {
      if (!this.record(metric)) this.invalid('Invalid headline metric');
      this.string(metric.key, 'headline metric key', 128);
      this.string(metric.label, 'headline metric label', 300);
      if (
        !['string', 'number'].includes(typeof metric.value) ||
        (typeof metric.value === 'number' && !Number.isFinite(metric.value))
      ) {
        this.invalid('Headline metric value is invalid');
      }
      this.oneOf(metric.unit, UNITS, 'headline metric unit');
      this.oneOf(metric.direction, DIRECTIONS, 'headline metric direction');
      this.oneOf(metric.severity, SEVERITIES, 'headline metric severity');
      const metricRefs = this.refs(
        metric.sourceRefs,
        submittedFacts,
        returnedRefs,
      );
      if (
        metricRefs.some(
          (ref: string) =>
            submittedFacts.get(ref)?.availability !==
            BriefingFactAvailability.AVAILABLE,
        )
      ) {
        this.invalid('Headline metrics require available source facts');
      }
      if (metric.unit === 'COUNT' && metric.value === 0) {
        this.invalid('A zero count cannot be a headline metric');
      }
    }

    if (!Array.isArray(value.sections))
      this.invalid('sections must be an array');
    const expectedSections = SECTION_IDS[input.briefingType];
    if (value.sections.length !== expectedSections.length) {
      this.invalid('Briefing response has an incomplete section set');
    }
    value.sections.forEach((section, index) => {
      if (!this.record(section)) this.invalid('Invalid briefing section');
      if (section.id !== expectedSections[index]) {
        this.invalid(
          'Briefing sections are missing, duplicated, or out of order',
        );
      }
      this.string(section.title, 'section title', 300);
      this.oneOf(section.kind, KINDS, 'section kind');
      this.oneOf(
        section.availability,
        Object.values(BriefingFactAvailability),
        'section availability',
      );
      this.string(section.summary, 'section summary', 4_000, true);
      if (!Array.isArray(section.items) || section.items.length > 100) {
        this.invalid('A briefing section contains too many items');
      }
      if (
        section.availability === BriefingFactAvailability.UNAVAILABLE &&
        section.items.length > 0
      ) {
        this.invalid('An unavailable briefing section must not contain items');
      }
      for (const item of section.items) {
        if (!this.record(item)) this.invalid('Invalid briefing section item');
        this.string(item.id, 'section item id', 200);
        this.string(item.label, 'section item label', 500);
        this.string(item.detail, 'section item detail', 5_000, true);
        this.string(item.status, 'section item status', 100, true);
        this.oneOf(item.severity, SEVERITIES, 'section item severity');
        const itemRefs = this.refs(
          item.sourceRefs,
          submittedFacts,
          returnedRefs,
        );
        const hasValue = item.value !== undefined;
        const hasUnit = item.unit !== undefined;
        if (hasValue !== hasUnit) {
          this.invalid('Section item value and unit must be provided together');
        }
        if (hasValue) {
          if (
            !['string', 'number'].includes(typeof item.value) ||
            (typeof item.value === 'number' && !Number.isFinite(item.value))
          ) {
            this.invalid('Section item value is invalid');
          }
          this.oneOf(item.unit, UNITS, 'section item unit');
        }
        if (typeof item.recommendationOnly !== 'boolean') {
          this.invalid('recommendationOnly must be boolean');
        }
        if (item.recommendationOnly === true) {
          if (item.proposalAction !== undefined) {
            this.invalid(
              'Recommendation-only items cannot contain a proposal action',
            );
          }
          if (item.proposalId !== undefined) {
            const linkedProposalId = this.string(
              item.proposalId,
              'linked proposalId',
              100,
            )!;
            if (
              proposalStatuses.get(linkedProposalId) !== 'NEEDS_CLARIFICATION'
            ) {
              this.invalid(
                'Recommendation-only item references an incompatible proposal',
              );
            }
            if (!itemRefs.includes(proposalFactIds.get(linkedProposalId)!)) {
              this.invalid(
                'Linked proposal must be cited by the decision item',
              );
            }
          }
        }
        if (
          item.recommendationOnly === false &&
          item.proposalId === undefined
        ) {
          this.invalid('Executable decision items must reference a proposal');
        }
        if (item.recommendationOnly === false) {
          const proposalId = this.string(
            item.proposalId,
            'decision proposalId',
            100,
          )!;
          const proposalStatus = proposalStatuses.get(proposalId);
          if (!proposalStatus) {
            this.invalid('Decision item references an unknown proposal');
          }
          if (!itemRefs.includes(proposalFactIds.get(proposalId)!)) {
            this.invalid(
              'Executable proposal must be cited by the decision item',
            );
          }
          this.oneOf(
            item.proposalAction,
            PROPOSAL_ACTIONS,
            'decision proposalAction',
          );
          if (
            (proposalStatus === 'PENDING' &&
              item.proposalAction !== 'APPROVE') ||
            (proposalStatus === 'FAILED' && item.proposalAction !== 'RETRY') ||
            !['PENDING', 'FAILED'].includes(proposalStatus)
          ) {
            this.invalid(
              'Decision action is incompatible with the current proposal status',
            );
          }
        }
      }
    });

    return value as Record<string, unknown>;
  }

  private validateReturnedRefs(
    value: unknown,
    submitted: Map<
      string,
      {
        sourceType: string;
        sourceId: string;
        capturedAt: string;
        availability: BriefingFactAvailability;
      }
    >,
  ) {
    if (!Array.isArray(value) || value.length > 500) {
      this.invalid('sourceRefs must contain at most 500 items');
    }
    const returned = new Set<string>();
    for (const item of value) {
      if (!this.record(item)) this.invalid('Invalid source reference');
      const ref = this.string(item.ref, 'source reference', 200)!;
      if (returned.has(ref)) this.invalid(`Duplicate source reference ${ref}`);
      const fact = submitted.get(ref);
      if (!fact) this.invalid(`Unknown source reference ${ref}`);
      if (
        item.sourceType !== fact.sourceType ||
        item.sourceId !== fact.sourceId ||
        item.capturedAt !== fact.capturedAt
      ) {
        this.invalid(`Source reference ${ref} does not match submitted facts`);
      }
      returned.add(ref);
    }
    return returned;
  }

  private refs(
    value: unknown,
    submitted: Map<string, unknown>,
    returned: Set<string>,
  ): string[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
      this.invalid('Factual briefing output requires sourceRefs');
    }
    for (const ref of value) {
      if (
        typeof ref !== 'string' ||
        !submitted.has(ref) ||
        !returned.has(ref)
      ) {
        this.invalid(`Unknown or omitted source reference ${String(ref)}`);
      }
    }
    return value as string[];
  }

  private string(
    value: unknown,
    field: string,
    maxLength: number,
    optional = false,
  ) {
    if (optional && value === undefined) return undefined;
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > maxLength
    ) {
      this.invalid(`${field} is invalid`);
    }
    return value.trim();
  }

  private number(value: unknown, field: string, min: number, max: number) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    ) {
      this.invalid(`${field} is invalid`);
    }
  }

  private oneOf(value: unknown, allowed: readonly string[], field: string) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      this.invalid(`${field} is invalid`);
    }
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private invalid(message: string): never {
    throw new BadRequestException(message);
  }
}

export { SECTION_IDS as EXECUTIVE_BRIEFING_SECTION_IDS };
