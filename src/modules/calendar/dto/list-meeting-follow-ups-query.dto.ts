import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MeetingFollowUpStatus } from '../../../common/enums/meeting-follow-up-status.enum';

export class ListMeetingFollowUpsQueryDto {
  @IsOptional()
  @IsEnum(MeetingFollowUpStatus)
  status = MeetingFollowUpStatus.PENDING;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
