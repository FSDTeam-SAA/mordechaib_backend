import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class SubscriptionPlanQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
