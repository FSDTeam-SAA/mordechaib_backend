import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';
import { PlatformMeetingStatus } from '../../../common/enums/platform-meeting-status.enum';

export class ListPlatformMeetingsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: MeetingPlatform })
  @IsOptional()
  @IsEnum(MeetingPlatform)
  platform?: MeetingPlatform;

  @ApiPropertyOptional({ enum: PlatformMeetingStatus })
  @IsOptional()
  @IsEnum(PlatformMeetingStatus)
  status?: PlatformMeetingStatus;
}
