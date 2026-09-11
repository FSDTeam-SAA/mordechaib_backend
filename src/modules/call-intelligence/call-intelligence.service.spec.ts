import { AiActionProposalStatus, AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { SourceAnalysesRepository } from '../source-analyses/source-analyses.repository';
import { CallIntelligenceService } from './call-intelligence.service';

const queryResult = (value: unknown) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

describe('CallIntelligenceService', () => {
  it('aggregates call metadata, lightweight transcript state, analysis and actions', async () => {
    const recordingQuery = queryResult({
      _id: '66cc9bdfa847ea856c7b41d2',
      callSid: 'CA123',
      recordingSid: 'RE123',
      recordingStatus: 'completed',
      recordingDuration: 75,
      aiStatus: 'COMPLETED',
      localFilePath: 'recordings/RE123.wav',
      transcriptText: 'hidden by projection',
    });
    const callQuery = queryResult({
      callSid: 'CA123',
      direction: 'OUTBOUND',
      status: 'COMPLETED',
      fromNumber: '+10000000000',
      toNumber: '+12222222222',
    });
    const sourceAnalyses = {
      findBySource: jest.fn().mockResolvedValue({
        _id: '66cc9bdfa847ea856c7b41d3',
        summary: 'Follow-up requested.',
        overallConfidence: 0.9,
      }),
    };
    const actions = {
      getActionCenter: jest.fn().mockResolvedValue({
        priorityTasks: [],
        meetingSchedules: [],
      }),
    };
    const service = new CallIntelligenceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { findOne: jest.fn().mockReturnValue(recordingQuery) } as never,
      { findOne: jest.fn().mockReturnValue(callQuery) } as never,
      {} as never,
      sourceAnalyses as unknown as SourceAnalysesRepository,
      actions as unknown as AiActionsService,
    );

    const result = await service.getDetails(
      '66cc9bdfa847ea856c7b41d1',
      '66cc9bdfa847ea856c7b41d2',
      {
        sourceType: AiProposalSourceType.CALL_TRANSCRIPT,
        status: AiActionProposalStatus.PENDING,
        taskLimit: 4,
        meetingLimit: 4,
        includeTranscript: false,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({ kind: 'CALL', durationSeconds: 75 }),
        transcript: expect.objectContaining({ included: false }),
        analysis: expect.objectContaining({ summary: 'Follow-up requested.' }),
        extensions: { crm: null },
      }),
    );
    expect(actions.getActionCenter).toHaveBeenCalledWith(
      '66cc9bdfa847ea856c7b41d1',
      '66cc9bdfa847ea856c7b41d2',
      expect.objectContaining({
        sourceType: AiProposalSourceType.CALL_TRANSCRIPT,
      }),
    );
  });

  it('escapes AI text in the downloadable HTML report', () => {
    const service = new CallIntelligenceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const report = service.createReport(
      {
        source: {
          type: AiProposalSourceType.GOOGLE_MEET,
          id: '66cc9bdfa847ea856c7b41d2',
        },
        metadata: {},
        audio: {},
        transcript: {},
        analysis: { summary: '<script>alert(1)</script>' },
        actions: {},
        extensions: { crm: null },
      } as never,
      'html',
    );

    expect(report.content.toString('utf8')).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(report.content.toString('utf8')).not.toContain(
      '<script>alert(1)</script>',
    );
  });
});
