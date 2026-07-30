const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/i;

const UNIT_IN_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

export function parseDurationToSeconds(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Duration must be a positive integer');
    }
    return value;
  }

  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use values such as 15m, 1h, or 7d.`,
    );
  }

  return Number(match[1]) * UNIT_IN_SECONDS[match[2].toLowerCase()];
}
