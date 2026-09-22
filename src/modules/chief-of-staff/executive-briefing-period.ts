import { BadRequestException } from '@nestjs/common';
import { ExecutiveBriefingType } from '../../common/enums/executive-briefing.enum';
import {
  localDayRange,
  localWeekRange,
} from '../../common/helpers/local-date-range.helper';
import { BriefingPeriod } from './executive-briefing.types';

export function executiveBriefingPeriod(
  type: ExecutiveBriefingType,
  asOf: Date,
  timezone: string,
): BriefingPeriod {
  if (Number.isNaN(asOf.getTime())) {
    throw new BadRequestException('asOf must be a valid ISO timestamp');
  }
  const range =
    type === ExecutiveBriefingType.WEEKLY_REVIEW
      ? localWeekRange(asOf, timezone)
      : localDayRange(asOf, timezone);
  return {
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    timezone,
  };
}
