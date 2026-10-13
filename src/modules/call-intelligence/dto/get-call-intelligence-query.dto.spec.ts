import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AiProposalSourceType } from '../../../database/schemas/ai-action-proposal.schema';
import { DownloadCallIntelligenceReportQueryDto } from './get-call-intelligence-query.dto';

describe('DownloadCallIntelligenceReportQueryDto', () => {
  it('includes transcript content and all proposal statuses by default', async () => {
    const query = plainToInstance(DownloadCallIntelligenceReportQueryDto, {
      sourceType: AiProposalSourceType.CALL_TRANSCRIPT,
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.includeTranscript).toBe(true);
    expect(query.status).toBeUndefined();
  });

  it('allows transcript content to be explicitly excluded', async () => {
    const query = plainToInstance(DownloadCallIntelligenceReportQueryDto, {
      sourceType: AiProposalSourceType.CALL_TRANSCRIPT,
      includeTranscript: 'false',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.includeTranscript).toBe(false);
  });
});
