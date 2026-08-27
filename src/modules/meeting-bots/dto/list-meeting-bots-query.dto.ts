import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MeetingBotStatus } from '../../../common/enums/meeting-bot-status.enum';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';

export class ListMeetingBotsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({ enum: MeetingBotStatus })
  @IsEnum(MeetingBotStatus)
  @IsOptional()
  status?: MeetingBotStatus;

  @ApiPropertyOptional({ enum: MeetingPlatform })
  @IsEnum(MeetingPlatform)
  @IsOptional()
  platform?: MeetingPlatform;
}
