import { extractAiUsageTelemetry } from './ai-usage-telemetry.helper';

describe('extractAiUsageTelemetry', () => {
  it('normalizes snake-case provider usage and derives total tokens', () => {
    expect(
      extractAiUsageTelemetry({
        usage: {
          provider: 'openai',
          model: 'gpt-example',
          input_tokens: 120,
          output_tokens: 30,
          provider_cost_usd: 0.0125,
          currency: 'usd',
        },
      }),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-example',
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      costUsd: 0.0125,
    });
  });

  it('does not ingest a non-USD cost payload', () => {
    expect(
      extractAiUsageTelemetry({
        usage: { totalTokens: 10, costUsd: 2, currency: 'EUR' },
      }),
    ).toBeUndefined();
  });

  it('returns undefined when no supported telemetry exists', () => {
    expect(extractAiUsageTelemetry({ result: 'ok' })).toBeUndefined();
  });
});
