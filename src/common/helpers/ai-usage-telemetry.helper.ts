export type AiUsageTelemetry = {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export function extractAiUsageTelemetry(value: unknown) {
  const root = record(value);
  const telemetry = record(root?.telemetry);
  const usage =
    record(root?.usage) ??
    record(telemetry?.usage) ??
    record(root?.usageTelemetry);
  if (!usage) return undefined;

  const inputTokens = integer(
    usage.inputTokens ??
      usage.input_tokens ??
      usage.promptTokens ??
      usage.prompt_tokens,
  );
  const outputTokens = integer(
    usage.outputTokens ??
      usage.output_tokens ??
      usage.completionTokens ??
      usage.completion_tokens,
  );
  const totalTokens = integer(usage.totalTokens ?? usage.total_tokens);
  const costUsd = nonNegativeNumber(
    usage.costUsd ??
      usage.cost_usd ??
      usage.providerCostUsd ??
      usage.provider_cost_usd,
  );
  const currency = text(usage.currency)?.toUpperCase();
  if (currency && currency !== 'USD') return undefined;
  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    costUsd === undefined
  ) {
    return undefined;
  }

  return {
    ...(text(usage.provider) ? { provider: text(usage.provider) } : {}),
    ...(text(usage.model) ? { model: text(usage.model) } : {}),
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined
      ? { totalTokens }
      : inputTokens !== undefined || outputTokens !== undefined
        ? { totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) }
        : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  } satisfies AiUsageTelemetry;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function integer(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function text(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 200) : undefined;
}
