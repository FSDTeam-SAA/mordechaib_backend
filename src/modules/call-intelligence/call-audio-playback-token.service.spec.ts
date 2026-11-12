import { ConfigService } from '@nestjs/config';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';
import { CallAudioPlaybackTokenService } from './call-audio-playback-token.service';

describe('CallAudioPlaybackTokenService', () => {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'callIntelligence.audioPlaybackSecret') {
        return 'test-playback-secret-that-is-long-enough';
      }
      if (key === 'callIntelligence.audioPlaybackTtlSeconds') return 300;
      return fallback;
    }),
  } as unknown as ConfigService;
  const service = new CallAudioPlaybackTokenService(config);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-12T08:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('issues and verifies an organization/source-scoped capability', () => {
    const issued = service.issue({
      organizationId: 'organization-1',
      sourceId: '6af410eab69b2c14f0f0add0',
      sourceType: AiProposalSourceType.CALL_AUDIO,
    });

    expect(issued.expiresAt.toISOString()).toBe('2026-11-12T08:05:00.000Z');
    expect(service.verify(issued.token)).toEqual({
      version: 1,
      organizationId: 'organization-1',
      sourceId: '6af410eab69b2c14f0f0add0',
      sourceType: AiProposalSourceType.CALL_AUDIO,
      expiresAt: 1794470700,
    });
  });

  it('rejects a modified capability', () => {
    const issued = service.issue({
      organizationId: 'organization-1',
      sourceId: '6af410eab69b2c14f0f0add0',
      sourceType: AiProposalSourceType.CALL_AUDIO,
    });
    expect(() => service.verify(`${issued.token}x`)).toThrow(
      'Invalid audio playback token',
    );
  });

  it('rejects an expired capability', () => {
    const issued = service.issue({
      organizationId: 'organization-1',
      sourceId: '6af410eab69b2c14f0f0add0',
      sourceType: AiProposalSourceType.CALL_TRANSCRIPT,
    });
    jest.setSystemTime(new Date('2026-11-12T08:05:01.000Z'));
    expect(() => service.verify(issued.token)).toThrow(
      'Audio playback token has expired',
    );
  });
});
