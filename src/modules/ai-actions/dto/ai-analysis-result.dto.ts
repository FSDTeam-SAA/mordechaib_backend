import {
  AiActionType,
  AiProposalEvidence,
  AiProposalSourceType,
} from '../../../database/schemas/ai-action-proposal.schema';
import { AgentType } from '../../../common/enums/agent-type.enum';
import { TranscriptInsightCategory } from '../../../database/schemas/ai-source-analysis.schema';

export type AiClassifiedTranscriptSegment = {
  id: string;
  category: TranscriptInsightCategory;
  text: string;
  speaker?: string;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  confidence?: number;
};

export type AiClarificationQuestionInput = {
  id: string;
  field: string;
  question: string;
  inputType?: string;
  required?: boolean;
};

export type AiAnalysisSummary = {
  summary?: string;
  overallConfidence?: number;
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
    valueProposition?: number;
    pricingObjection?: number;
    budgetApproval?: number;
    marketTrends?: number;
    followUpRequests?: number;
  };
  classifiedSegments?: AiClassifiedTranscriptSegment[];
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
  source: { type: AiProposalSourceType; id: string };
  actions: AiAnalysisAction[];
  analysis: AiAnalysisSummary;
};
