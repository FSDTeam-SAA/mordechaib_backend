import { BadRequestException } from '@nestjs/common';

export type MetaDateFilterInput = {
  date?: string;
  fromDate?: string;
  toDate?: string;
  startTime?: string;
  endTime?: string;
  timezoneOffset?: string;
};

export type MetaTimeRange = {
  since?: number;
  until?: number;
};

const START_OF_DAY = '00:00:00';
const END_OF_DAY = '23:59:59';

/** Converts the public date/time filter contract to Meta's Unix time range. */
export function resolveMetaTimeRange(
  filter: MetaDateFilterInput,
): MetaTimeRange {
  const hasSingleDate = Boolean(filter.date);
  const hasRangeBoundary = Boolean(filter.fromDate || filter.toDate);
  const hasTime = Boolean(filter.startTime || filter.endTime);

  if (hasSingleDate && hasRangeBoundary) {
    throw new BadRequestException(
      'date cannot be combined with fromDate or toDate',
    );
  }

  if (Boolean(filter.fromDate) !== Boolean(filter.toDate)) {
    throw new BadRequestException(
      'fromDate and toDate must be provided together',
    );
  }

  if (hasTime && !hasSingleDate && !hasRangeBoundary) {
    throw new BadRequestException(
      'startTime and endTime require date or a fromDate/toDate range',
    );
  }

  if (filter.timezoneOffset && !hasSingleDate && !hasRangeBoundary) {
    throw new BadRequestException(
      'timezoneOffset requires date or a fromDate/toDate range',
    );
  }

  if (!hasSingleDate && !hasRangeBoundary) return {};

  const firstDate = filter.date ?? filter.fromDate!;
  const lastDate = filter.date ?? filter.toDate!;
  const offsetMinutes = parseTimezoneOffset(filter.timezoneOffset ?? 'Z');
  const since = toUnixTimestamp(
    firstDate,
    filter.startTime ?? START_OF_DAY,
    offsetMinutes,
    false,
  );
  const until = toUnixTimestamp(
    lastDate,
    filter.endTime ?? END_OF_DAY,
    offsetMinutes,
    true,
  );

  if (since > until) {
    throw new BadRequestException(
      'The filter start date/time must be before the end date/time',
    );
  }

  return { since, until };
}

function parseTimezoneOffset(value: string): number {
  if (value === 'Z') return 0;

  const sign = value[0] === '+' ? 1 : -1;
  const [hours, minutes] = value.slice(1).split(':').map(Number);
  return sign * (hours * 60 + minutes);
}

function toUnixTimestamp(
  date: string,
  time: string,
  offsetMinutes: number,
  endBoundary: boolean,
): number {
  const [year, month, day] = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const [hours, minutes] = timeParts;
  const seconds = timeParts[2] ?? (endBoundary ? 59 : 0);
  const utcMilliseconds =
    Date.UTC(year, month - 1, day, hours, minutes, seconds) -
    offsetMinutes * 60_000;

  return Math.floor(utcMilliseconds / 1000);
}
