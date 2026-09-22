import { BadRequestException } from '@nestjs/common';
import { assertValidTimezone } from './timezone.helper';

export type LocalCalendarDate = {
  year: number;
  month: number;
  day: number;
};

export type ZonedDateRange = {
  start: Date;
  end: Date;
  timezone: string;
};

export function localDayRange(value: Date, timezone: string): ZonedDateRange {
  assertValidDate(value);
  assertValidTimezone(timezone);
  const date = localCalendarDate(value, timezone);
  return {
    start: localMidnightUtc(date, timezone),
    end: localMidnightUtc(addLocalDays(date, 1), timezone),
    timezone,
  };
}

export function trailingLocalDaysRange(
  value: Date,
  timezone: string,
  days: number,
): ZonedDateRange {
  if (!Number.isInteger(days) || days < 1) {
    throw new BadRequestException('days must be a positive integer');
  }
  const today = localDayRange(value, timezone);
  const todayDate = localCalendarDate(value, timezone);
  return {
    start: localMidnightUtc(addLocalDays(todayDate, -(days - 1)), timezone),
    end: today.end,
    timezone,
  };
}

export function localWeekRange(value: Date, timezone: string): ZonedDateRange {
  assertValidDate(value);
  assertValidTimezone(timezone);
  const date = localCalendarDate(value, timezone);
  const weekday = weekdayNumber(localMidnightUtc(date, timezone), timezone);
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  const startDate = addLocalDays(date, -mondayOffset);
  return {
    start: localMidnightUtc(startDate, timezone),
    end: localMidnightUtc(addLocalDays(startDate, 7), timezone),
    timezone,
  };
}

export function localDateKey(value: Date, timezone: string) {
  assertValidDate(value);
  assertValidTimezone(timezone);
  const date = localCalendarDate(value, timezone);
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(
    date.day,
  ).padStart(2, '0')}`;
}

export function localDateKeys(start: Date, count: number, timezone: string) {
  if (!Number.isInteger(count) || count < 1) {
    throw new BadRequestException('count must be a positive integer');
  }
  const first = localCalendarDate(start, timezone);
  return Array.from({ length: count }, (_, index) => {
    const date = addLocalDays(first, index);
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(
      date.day,
    ).padStart(2, '0')}`;
  });
}

export function localCalendarDate(
  value: Date,
  timezone: string,
): LocalCalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return {
    year: Number(part(parts, 'year')),
    month: Number(part(parts, 'month')),
    day: Number(part(parts, 'day')),
  };
}

export function addLocalDays(
  value: LocalCalendarDate,
  days: number,
): LocalCalendarDate {
  const date = new Date(
    Date.UTC(value.year, value.month - 1, value.day + days),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function localMidnightUtc(value: LocalCalendarDate, timezone: string) {
  let guess = Date.UTC(value.year, value.month - 1, value.day);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const represented = localDateTimeParts(new Date(guess), timezone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    const targetAsUtc = Date.UTC(value.year, value.month - 1, value.day);
    guess += targetAsUtc - representedAsUtc;
  }
  return new Date(guess);
}

function weekdayNumber(value: Date, timezone: string) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(value);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

function localDateTimeParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  return {
    year: Number(part(parts, 'year')),
    month: Number(part(parts, 'month')),
    day: Number(part(parts, 'day')),
    hour: Number(part(parts, 'hour')),
    minute: Number(part(parts, 'minute')),
    second: Number(part(parts, 'second')),
  };
}

function part(parts: Intl.DateTimeFormatPart[], type: string) {
  const value = parts.find((item) => item.type === type)?.value;
  if (!value) {
    throw new BadRequestException('Unable to calculate timezone period');
  }
  return value;
}

function assertValidDate(value: Date) {
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException('date must be a valid timestamp');
  }
}
