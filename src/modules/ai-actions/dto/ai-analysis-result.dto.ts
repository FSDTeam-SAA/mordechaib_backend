import {
  AiActionType,
  AiProposalEvidence,
  AiProposalSourceType,
} from '../../../database/schemas/ai-action-proposal.schema';
import { AgentType } from '../../../common/enums/agent-type.enum';

export type AiClarificationQuestionInput = {
  id: string;
  field: string;
  question: string;
  inputType?: string;
  required?: boolean;
};

export type AiAnalysisSummary = {
  sentimentAnalysis: {
    score: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  customerIntelligence: {
    healthScore: number;
    riskLevel: string;
  };
  patternDetection: {
    valueProposition: number;
    pricingObjection: number;
    budgetApproval: number;
    marketTrends: number;
    followUpRequests: number;
  };
};

/**
 * The only action contract accepted from the AI service. The AI service
 * returns this JSON to the Main Backend; it never writes Main Backend data.
 */
export type AiAnalysisAction = {
  actionId: string;
  actionType: AiActionType;
  proposedByAgent: { id: string; name: string; type: AgentType };
  payload: Record<string, unknown>;
  confidence: number;
  evidence?: AiProposalEvidence[];
  clarificationQuestions?: AiClarificationQuestionInput[];
};

export type AiAnalysisResult = {
  requestId: string;
  source?: { type: AiProposalSourceType; id: string };
  actions: AiAnalysisAction[];
  analysis: AiAnalysisSummary;
};
