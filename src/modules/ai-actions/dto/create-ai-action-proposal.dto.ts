import { PickType } from '@nestjs/swagger';
import { CreateConnectedMeetingDto } from '../../meeting-bots/dto/create-connected-meeting.dto';
import { CreateTaskDto } from '../../tasks/dto/create-task.dto';

/** Payload validation shared by internally persisted AI action drafts. */
export class AiTaskActionPayloadDto extends PickType(CreateTaskDto, [
  'title',
  'description',
  'assignedToUserId',
  'department',
  'priority',
  'dueDate',
  'estimatedDurationMinutes',
  'stakeholderIds',
  'dependencies',
  'requiredAttachments',
  'reminder',
  'subtasks',
  'tags',
] as const) {}

export class AiMeetingActionPayloadDto extends PickType(
  CreateConnectedMeetingDto,
  [
    'platform',
    'title',
    'agenda',
    'startsAt',
    'durationMinutes',
    'timezone',
    'invitees',
    'reminderMinutesBeforeStart',
    'sendBot',
    'botName',
  ] as const,
) {}
