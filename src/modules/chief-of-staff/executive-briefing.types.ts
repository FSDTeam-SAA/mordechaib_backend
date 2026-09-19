import {
  BriefingFactAvailability,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';

export type BriefingPeriod = {
  start: string;
  end: string;
  timezone: string;
};

export type BriefingFact = {
  id: string;
  sourceType: string;
  sourceId: string;
  capturedAt: string;
  data: Record<string, unknown>;
};

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
