export type BusinessHoursConfig = {
  start?: string | null;
  end?: string | null;
};

/**
 * Evaluates whether a given timestamp falls within an organization's configured
 * business hours in their local timezone.
 *
 * If business hours are not configured or incomplete, returns `true` by default
 * so calling remains available 24/7 unless explicitly restricted.
 */
export function isWithinBusinessHours(
  date: Date,
  businessHours?: BusinessHoursConfig | null,
  timezone = 'UTC',
): boolean {
  if (!businessHours?.start || !businessHours?.end) {
    return true;
  }

  const startMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
    businessHours.start.trim(),
  );
  const endMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
    businessHours.end.trim(),
  );

  if (!startMatch || !endMatch) {
    return true;
  }

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);

  let currentMinutes: number;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    currentMinutes = hour * 60 + minute;
  } catch {
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    currentMinutes = hour * 60 + minute;
  }

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

