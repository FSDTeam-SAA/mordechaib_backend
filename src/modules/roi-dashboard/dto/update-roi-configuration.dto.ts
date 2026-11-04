import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateRoiConfigurationDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1440)
  taskCreationMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1440)
  meetingSchedulingMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1440)
  crmUpdateMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1440)
  emailDraftMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000)
  hourlyLaborCost?: number;

  @ApiPropertyOptional({ example: 'USD', minLength: 3, maxLength: 3 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
