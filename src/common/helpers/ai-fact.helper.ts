export type AiFact = {
  id: string;
  sourceType: string;
  sourceId: string;
  capturedAt: string;
  data: Record<string, unknown>;
};

export function aiIsoTimestamp(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return undefined;
}

export function boundedAiText(
  value: unknown,
  maxLength: number,
): string | undefined {
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
}

export function createAiFact(
  prefix: string,
  sourceType: string,
  source: Record<string, unknown>,
  data: Record<string, unknown>,
): AiFact {
  const sourceId = String(source._id);
  return {
    id: `${prefix}-${sourceId}`,
    sourceType,
    sourceId,
    capturedAt:
      aiIsoTimestamp(source.updatedAt) ||
      aiIsoTimestamp(source.createdAt) ||
      new Date(0).toISOString(),
    data,
  };
}

export function boundedRows<T>(
  rows: T[],
  limit: number,
): { items: T[]; truncated: boolean } {
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}
