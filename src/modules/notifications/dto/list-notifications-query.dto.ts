import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  NotificationReadFilter,
  NotificationType,
} from '../../../common/enums/notification-type.enum';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationReadFilter)
  status?: NotificationReadFilter = NotificationReadFilter.ALL;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

