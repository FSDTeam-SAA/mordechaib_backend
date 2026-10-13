import type { AiProposalSource } from '../../database/schemas/ai-action-proposal.schema';

export type AiActionSourceSummary = {
  total: number;
  tasks: number;
  meetings: number;
  analyzing: number;
  needsClarification: number;
  pending: number;
  approved: number;
  rejected: number;
  executing: number;
  executed: number;
  failed: number;
  hasUserActionRequired: boolean;
};

export function aiActionSourceKey(source: AiProposalSource) {
  return `${source.type}\u0000${source.id}`;
}

export function createEmptyAiActionSourceSummary(): AiActionSourceSummary {
  return {
    total: 0,
    tasks: 0,
    meetings: 0,
    analyzing: 0,
    needsClarification: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    executing: 0,
    executed: 0,
    failed: 0,
    hasUserActionRequired: false,
  };
}
