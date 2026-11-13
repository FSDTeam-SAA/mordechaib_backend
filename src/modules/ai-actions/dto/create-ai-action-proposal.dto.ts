import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';
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
] as const) {
  @ApiPropertyOptional({
    description:
      'Noltra customer ID resolved from the organization-scoped customer directory',
    example: '66cc9bdfa847ea856c7b41d2',
  })
  @IsOptional()
  @IsMongoId()
  customerId?: string;
}

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
) {
  @ApiPropertyOptional({
    description:
      'Noltra customer ID resolved from the organization-scoped customer directory',
    example: '66cc9bdfa847ea856c7b41d2',
  })
  @IsOptional()
  @IsMongoId()
  customerId?: string;
}
