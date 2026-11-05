import { MeetingPrioritySource } from '../../common/enums/meeting-priority-source.enum';
import { MeetingUrgency } from '../../common/enums/meeting-urgency.enum';
import { CalendarPriorityService } from './calendar-priority.service';

describe('CalendarPriorityService', () => {
  const service = new CalendarPriorityService();

  it('scores only explicitly classified priorities', () => {
    expect(
      service.assess({
        urgency: MeetingUrgency.HIGH,
        source: MeetingPrioritySource.USER,
      }),
    ).toMatchObject({ availability: 'AVAILABLE', score: 90 });

    expect(
      service.assess({
        urgency: MeetingUrgency.MEDIUM,
        source: MeetingPrioritySource.IMPORTED,
      }),
    ).toMatchObject({
      availability: 'UNAVAILABLE',
      score: null,
      reason: 'PRIORITY_NOT_EXPLICITLY_CLASSIFIED',
    });
  });
});
