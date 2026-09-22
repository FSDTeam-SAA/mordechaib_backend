import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class EstimateUsageQueryDto {
  // Monthly call minutes used
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyCalls?: number;

  // Monthly AI actions needed
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyActions?: number;

  // Monthly meeting hours needed
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  meetingHours?: number;
}
