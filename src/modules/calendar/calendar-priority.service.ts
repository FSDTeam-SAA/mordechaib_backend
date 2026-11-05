import { Injectable } from '@nestjs/common';
import { MeetingPrioritySource } from '../../common/enums/meeting-priority-source.enum';
import { MeetingUrgency } from '../../common/enums/meeting-urgency.enum';

export type CalendarPriorityInput = {
  urgency?: MeetingUrgency;
  source?: MeetingPrioritySource;
};

export type CalendarPriorityAssessment = {
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  urgency: MeetingUrgency | null;
  score: number | null;
  source: MeetingPrioritySource | null;
  methodologyVersion: 'URGENCY_WEIGHTED_V1';
  reason?: 'PRIORITY_NOT_EXPLICITLY_CLASSIFIED';
};

const SCORES: Record<MeetingUrgency, number> = {
  [MeetingUrgency.HIGH]: 90,
  [MeetingUrgency.MEDIUM]: 60,
  [MeetingUrgency.LOW]: 30,
};

@Injectable()
export class CalendarPriorityService {
  assess(input: CalendarPriorityInput): CalendarPriorityAssessment {
    const grounded = input.source === MeetingPrioritySource.USER;
    if (!grounded || !input.urgency) {
      return {
        availability: 'UNAVAILABLE',
        urgency: input.urgency || null,
        score: null,
        source: input.source || null,
        methodologyVersion: 'URGENCY_WEIGHTED_V1',
        reason: 'PRIORITY_NOT_EXPLICITLY_CLASSIFIED',
      };
    }

    return {
      availability: 'AVAILABLE',
      urgency: input.urgency,
      score: SCORES[input.urgency],
      source: MeetingPrioritySource.USER,
      methodologyVersion: 'URGENCY_WEIGHTED_V1',
    };
  }
}
