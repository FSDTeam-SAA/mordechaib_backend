import { BadRequestException } from '@nestjs/common';
import { ExecutiveBriefingType } from '../../common/enums/executive-briefing.enum';
import { assertValidTimezone } from '../../common/helpers/timezone.helper';
import { BriefingPeriod } from './executive-briefing.types';

type LocalDate = { year: number; month: number; day: number };

export function executiveBriefingPeriod(
  type: ExecutiveBriefingType,
  asOf: Date,
  timezone: string,
): BriefingPeriod {
  if (Number.isNaN(asOf.getTime())) {
    throw new BadRequestException('asOf must be a valid ISO timestamp');
  }
  assertValidTimezone(timezone);
  const local = localDate(asOf, timezone);
  const startDate =
    type === ExecutiveBriefingType.WEEKLY_REVIEW
      ? addDays(local, -weekdayOffset(local, timezone))
      : local;
  const durationDays = type === ExecutiveBriefingType.WEEKLY_REVIEW ? 7 : 1;
  const endDate = addDays(startDate, durationDays);
  return {
    start: localMidnightUtc(startDate, timezone).toISOString(),
    end: localMidnightUtc(endDate, timezone).toISOString(),
    timezone,
  };
}

function localDate(value: Date, timezone: string): LocalDate {
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

function weekdayOffset(value: LocalDate, timezone: string) {
  const midnight = localMidnightUtc(value, timezone);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(midnight);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
  return day === 0 ? 6 : day - 1;
}

function addDays(value: LocalDate, days: number): LocalDate {
  const date = new Date(
    Date.UTC(value.year, value.month - 1, value.day + days),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function localMidnightUtc(value: LocalDate, timezone: string) {
  let guess = Date.UTC(value.year, value.month - 1, value.day);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const represented = dateTimeParts(new Date(guess), timezone);
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

function dateTimeParts(value: Date, timezone: string) {
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
  if (!value)
    throw new BadRequestException('Unable to calculate briefing period');
  return value;
}
