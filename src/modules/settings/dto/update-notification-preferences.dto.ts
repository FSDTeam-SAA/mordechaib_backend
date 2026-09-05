import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  inAppNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  agentTaskCompletions?: boolean;

  @IsBoolean()
  @IsOptional()
  meetingReminders?: boolean;

  @IsBoolean()
  @IsOptional()
  weeklyRoiReports?: boolean;

  @IsBoolean()
  @IsOptional()
  productUpdates?: boolean;
}
