import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { assertValidTimezone } from '../../common/helpers/timezone.helper';
import { OnboardingAvailability } from '../../database/schemas/onboarding-availability.schema';
import { RequestUser } from '../../common/types/request-context.type';
import { OnboardingAvailableSlotsQueryDto } from './dto/onboarding-available-slots-query.dto';
import { UpsertOnboardingAvailabilityDto } from './dto/upsert-onboarding-availability.dto';
import { OnboardingAvailabilityRepository } from './onboarding-availability.repository';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';

type AvailabilityRule = OnboardingAvailability & { _id: unknown };

type AvailableSlot = {
  startTime: string;
  endTime: string;
};

@Injectable()
export class OnboardingAvailabilityService {
  constructor(
    private readonly availabilityRepository: OnboardingAvailabilityRepository,
    private readonly setupsRepository: OnboardingSetupsRepository,
  ) {}

  getAdminAvailability() {
    return this.availabilityRepository.findDefault();
  }

  async getPublicAvailability() {
    const rule = await this.requireActiveRule();
    return {
      timezone: rule.timezone,
      startDate: rule.startDate,
      endDate: rule.endDate,
      weekdays: rule.weekdays,
      dailyStartTime: rule.dailyStartTime,
      dailyEndTime: rule.dailyEndTime,
      meetingDurationMinutes: rule.meetingDurationMinutes,
      bufferMinutes: rule.bufferMinutes,
      blockedDates: rule.blockedDates,
    };
  }

  async upsertAdminAvailability(
    dto: UpsertOnboardingAvailabilityDto,
    admin: RequestUser,
  ) {
    assertValidTimezone(dto.timezone);
    this.assertLocalDate(dto.startDate, 'startDate');
    if (dto.endDate) {
      this.assertLocalDate(dto.endDate, 'endDate');
      if (dto.endDate < dto.startDate) {
        throw new BadRequestException(
          'endDate must be on or after startDate',
        );
      }
    }
    for (const date of dto.blockedDates ?? []) {
      this.assertLocalDate(date, 'blockedDates');
    }

    const openingMinutes = this.timeToMinutes(dto.dailyStartTime);
    const closingMinutes = this.timeToMinutes(dto.dailyEndTime);
    if (openingMinutes >= closingMinutes) {
      throw new BadRequestException(
        'dailyStartTime must be before dailyEndTime',
      );
    }
    if (openingMinutes + dto.meetingDurationMinutes > closingMinutes) {
      throw new BadRequestException(
        'The daily availability window must fit at least one meeting',
      );
    }

    return this.availabilityRepository.upsertDefault(
      {
        timezone: dto.timezone.trim(),
        startDate: dto.startDate,
        ...(dto.endDate ? { endDate: dto.endDate } : {}),
        weekdays: [...dto.weekdays].sort((a, b) => a - b),
        dailyStartTime: dto.dailyStartTime,
        dailyEndTime: dto.dailyEndTime,
        meetingDurationMinutes: dto.meetingDurationMinutes,
        bufferMinutes: dto.bufferMinutes ?? 0,
        blockedDates: [...(dto.blockedDates ?? [])].sort(),
        isActive: dto.isActive ?? true,
        updatedBy: admin.id,
      },
      !dto.endDate,
    );
  }

  async getAvailableSlots(
    query: OnboardingAvailableSlotsQueryDto,
    excludeSetupId?: string,
  ) {
    this.assertLocalDate(query.date, 'date');
    if (query.timezone) assertValidTimezone(query.timezone);

    const rule = await this.requireActiveRule();
    const slots = await this.calculateSlots(rule, query.date, excludeSetupId);
    return {
      date: query.date,
      timezone: rule.timezone,
      displayTimezone: query.timezone || rule.timezone,
      meetingDurationMinutes: rule.meetingDurationMinutes,
      bufferMinutes: rule.bufferMinutes,
      slots,
    };
  }

  async resolveBookableSlot(
    startTime: string,
    expectedEndTime?: string,
    excludeSetupId?: string,
  ) {
    const requestedStart = new Date(startTime);
    if (Number.isNaN(requestedStart.getTime())) {
      throw new BadRequestException('startTime must be a valid ISO date');
    }

    const rule = await this.requireActiveRule();
    const localDate = this.localDate(requestedStart, rule.timezone);
    const slots = await this.calculateSlots(rule, localDate, excludeSetupId);
    const slot = slots.find(
      (candidate) =>
        new Date(candidate.startTime).getTime() === requestedStart.getTime(),
    );
    if (!slot) {
      throw new BadRequestException(
        'The selected onboarding meeting slot is not available',
      );
    }

    if (
      expectedEndTime &&
      new Date(expectedEndTime).getTime() !== new Date(slot.endTime).getTime()
    ) {
      throw new BadRequestException(
        'endTime must match the server-calculated meeting end time',
      );
    }

    return {
      start: new Date(slot.startTime),
      end: new Date(slot.endTime),
      timezone: rule.timezone,
    };
  }

  private async requireActiveRule(): Promise<AvailabilityRule> {
    const rule = await this.availabilityRepository.findDefault();
    if (!rule?.isActive) {
      throw new ServiceUnavailableException(
        'Onboarding meeting availability is not configured',
      );
    }
    return rule;
  }

  private async calculateSlots(
    rule: AvailabilityRule,
    date: string,
    excludeSetupId?: string,
  ): Promise<AvailableSlot[]> {
    if (!this.isAvailableDate(rule, date)) return [];

    const opening = this.localDateTimeToUtc(
      date,
      rule.dailyStartTime,
      rule.timezone,
    );
    const closing = this.localDateTimeToUtc(
      date,
      rule.dailyEndTime,
      rule.timezone,
    );
    if (!opening || !closing) return [];

    const booked = await this.setupsRepository.findScheduledMeetingsInRange(
      closing,
      opening,
      excludeSetupId,
    );
    const durationMs = rule.meetingDurationMinutes * 60_000;
    const stepMs =
      (rule.meetingDurationMinutes + rule.bufferMinutes) * 60_000;
    const now = Date.now();
    const slots: AvailableSlot[] = [];

    for (
      let slotStartMs = opening.getTime();
      slotStartMs + durationMs <= closing.getTime();
      slotStartMs += stepMs
    ) {
      const slotEndMs = slotStartMs + durationMs;
      if (slotStartMs <= now) continue;
      const conflicts = booked.some((setup) => {
        const bookedStart = setup.meeting?.startTime?.getTime();
        const bookedEnd = setup.meeting?.endTime?.getTime();
        return Boolean(
          bookedStart !== undefined &&
            bookedEnd !== undefined &&
            slotStartMs < bookedEnd &&
            slotEndMs > bookedStart,
        );
      });
      if (conflicts) continue;

      slots.push({
        startTime: new Date(slotStartMs).toISOString(),
        endTime: new Date(slotEndMs).toISOString(),
      });
    }

    return slots;
  }

  private isAvailableDate(rule: AvailabilityRule, date: string) {
    if (date < rule.startDate) return false;
    if (rule.endDate && date > rule.endDate) return false;
    if (rule.blockedDates?.includes(date)) return false;

    const weekday = this.localDateWeekday(date);
    return rule.weekdays.includes(weekday);
  }

  private localDateWeekday(date: string) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  private localDate(value: Date, timezone: string) {
    const parts = this.zonedParts(value, timezone);
    return `${parts.year}-${this.pad(parts.month)}-${this.pad(parts.day)}`;
  }

  private localDateTimeToUtc(
    date: string,
    time: string,
    timezone: string,
  ): Date | null {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    let timestamp = targetAsUtc;

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const represented = this.zonedParts(new Date(timestamp), timezone);
      const representedAsUtc = Date.UTC(
        represented.year,
        represented.month - 1,
        represented.day,
        represented.hour,
        represented.minute,
      );
      const adjustment = targetAsUtc - representedAsUtc;
      timestamp += adjustment;
      if (adjustment === 0) break;
    }

    const result = new Date(timestamp);
    const verified = this.zonedParts(result, timezone);
    if (
      verified.year !== year ||
      verified.month !== month ||
      verified.day !== day ||
      verified.hour !== hour ||
      verified.minute !== minute
    ) {
      return null;
    }
    return result;
  }

  private zonedParts(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(value);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      hour: read('hour'),
      minute: read('minute'),
    };
  }

  private assertLocalDate(value: string, field: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
  }

  private timeToMinutes(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private pad(value: number) {
    return String(value).padStart(2, '0');
  }
}
