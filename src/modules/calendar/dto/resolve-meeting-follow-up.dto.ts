import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { MeetingFollowUpStatus } from '../../../common/enums/meeting-follow-up-status.enum';

const RESOLUTION_STATUSES = [
  MeetingFollowUpStatus.COMPLETED,
  MeetingFollowUpStatus.DISMISSED,
];

export class ResolveMeetingFollowUpDto {
  @ApiProperty({ enum: RESOLUTION_STATUSES })
  @IsIn(RESOLUTION_STATUSES)
  status!:
    | MeetingFollowUpStatus.COMPLETED
    | MeetingFollowUpStatus.DISMISSED;
}
