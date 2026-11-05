import { Injectable } from '@nestjs/common';
import {
  addLocalDays,
  localCalendarDate,
  localTimeUtc,
} from '../../common/helpers/local-date-range.helper';

type BusyPeriod = { startsAt: Date; endsAt: Date };
type BusinessHours = { start: string; end: string };

type SchedulingInput = {
  from: Date;
  to: Date;
  now: Date;
  timezone: string;
  businessHours?: BusinessHours;
  busy: BusyPeriod[];
  durationMinutes: number;
  bufferMinutes: number;
  limit: number;
};

@Injectable()
export class CalendarSchedulingService {
  suggest(input: SchedulingInput) {
    if (!this.validBusinessHours(input.businessHours)) {
      return {
        availability: 'UNAVAILABLE' as const,
        engine: 'DETERMINISTIC' as const,
        suggestions: [],
        reason: 'BUSINESS_HOURS_NOT_CONFIGURED',
      };
    }

    const suggestions: Array<{
      startsAt: string;
      endsAt: string;
      timezone: string;
    }> = [];
    const durationMs = input.durationMinutes * 60_000;
    const bufferMs = input.bufferMinutes * 60_000;
    const rangeStart = new Date(
      Math.max(input.from.getTime(), input.now.getTime()),
    );
    let day = localCalendarDate(rangeStart, input.timezone);

    while (suggestions.length < input.limit) {
      const windowStart = localTimeUtc(
        day,
        input.businessHours.start,
        input.timezone,
      );
      const windowEnd = localTimeUtc(
        day,
        input.businessHours.end,
        input.timezone,
      );
      if (windowStart >= input.to) break;

      let cursor = new Date(
        Math.max(windowStart.getTime(), rangeStart.getTime()),
      );
      const busy = input.busy
        .filter(
          (item) => item.startsAt < windowEnd && item.endsAt > windowStart,
        )
        .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

      for (const item of busy) {
        const blockedStart = item.startsAt.getTime() - bufferMs;
        if (
          cursor.getTime() + durationMs <= blockedStart &&
          cursor.getTime() + durationMs <= windowEnd.getTime() &&
          cursor.getTime() + durationMs <= input.to.getTime()
        ) {
          this.addSuggestion(suggestions, cursor, durationMs, input.timezone);
          if (suggestions.length >= input.limit) break;
        }
        cursor = new Date(
          Math.max(cursor.getTime(), item.endsAt.getTime() + bufferMs),
        );
      }

      if (
        suggestions.length < input.limit &&
        cursor.getTime() + durationMs <= windowEnd.getTime() &&
        cursor.getTime() + durationMs <= input.to.getTime()
      ) {
        this.addSuggestion(suggestions, cursor, durationMs, input.timezone);
      }
      day = addLocalDays(day, 1);
    }

    return {
      availability: 'AVAILABLE' as const,
      engine: 'DETERMINISTIC' as const,
      methodologyVersion: 'BUSINESS_HOURS_FREE_SLOT_V1' as const,
      calendarCoverage: 'DEFAULT_CALENDAR_AND_PLATFORM_MEETINGS' as const,
      participantAvailability: 'ORGANIZER_CALENDAR_ONLY' as const,
      isEstimated: false as const,
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes,
      suggestions,
    };
  }

  private addSuggestion(
    suggestions: Array<{
      startsAt: string;
      endsAt: string;
      timezone: string;
    }>,
    startsAt: Date,
    durationMs: number,
    timezone: string,
  ) {
    suggestions.push({
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + durationMs).toISOString(),
      timezone,
    });
  }

  private validBusinessHours(
    value?: BusinessHours,
  ): value is BusinessHours {
    if (!value) return false;
    const pattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    return (
      pattern.test(value.start) &&
      pattern.test(value.end) &&
      value.start < value.end
    );
  }
}
