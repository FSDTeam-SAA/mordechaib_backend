import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DashboardListQueryDto {
  @ApiPropertyOptional({
    type: Number,
    default: 4,
    minimum: 1,
    maximum: 20,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 4;
}

export class DashboardSummaryQueryDto {
  @ApiPropertyOptional({
    type: Number,
    default: 7,
    minimum: 2,
    maximum: 30,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  days: number = 7;
}

export class DashboardWorkforceQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    type: Number,
    default: 24,
    minimum: 1,
    maximum: 720,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  activityHours: number = 24;
}
