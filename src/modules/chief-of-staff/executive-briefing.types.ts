import {
  BriefingFactAvailability,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { AiFact } from '../../common/helpers/ai-fact.helper';

export type BriefingPeriod = {
  start: string;
  end: string;
  timezone: string;
};

export type BriefingFact = AiFact;

export type BriefingFactGroup = {
  availability: BriefingFactAvailability;
  items: BriefingFact[];
};

export type ExecutiveBriefingFacts = {
  tasks: BriefingFactGroup;
  meetings: BriefingFactGroup;
  actionProposals: BriefingFactGroup;
  sourceAnalyses: BriefingFactGroup;
  agentActivity: BriefingFactGroup;
  sales: BriefingFactGroup;
  customers: BriefingFactGroup;
  support: BriefingFactGroup;
  finance: BriefingFactGroup;
  vendors: BriefingFactGroup;
  marketing: BriefingFactGroup;
  productDesign: BriefingFactGroup;
  roi: BriefingFactGroup;
  aiQuality: BriefingFactGroup;
  strategicNotes: BriefingFactGroup;
};

export type ExecutiveBriefingAiRequest = {
  schemaVersion: '1.0';
  jobId: string;
  idempotencyKey: string;
  organizationId: string;
  briefingType: ExecutiveBriefingType;
  period: BriefingPeriod;
  requester: {
    userId: string;
    name: string;
    language: string;
    scopeHash: string;
  };
  organization: {
    name: string;
    industry?: string;
  };
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
  facts: ExecutiveBriefingFacts;
  generatedAt: string;
};

export type PreparedExecutiveBriefing = {
  input: ExecutiveBriefingAiRequest;
  inputHash: string;
  requesterScopeHash: string;
};
