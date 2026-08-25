import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ZoomMeetingStatus } from '../../../common/enums/zoom-meeting-status.enum';

export class ListZoomMeetingsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @IsEnum(ZoomMeetingStatus)
  @IsOptional()
  status?: ZoomMeetingStatus;
}
