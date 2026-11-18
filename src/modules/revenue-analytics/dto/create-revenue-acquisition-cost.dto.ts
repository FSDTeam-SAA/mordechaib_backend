import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';
import { RevenueAcquisitionChannel } from '../revenue-analytics.enums';

export class CreateRevenueAcquisitionCostDto {
  @ApiProperty({ example: '2026-11', pattern: '^YYYY-MM$' })
  @Transform(trimString)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @ApiProperty({ enum: RevenueAcquisitionChannel })
  @IsEnum(RevenueAcquisitionChannel)
  channel!: RevenueAcquisitionChannel;

  @ApiProperty({ minimum: 0, example: 1200 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salesCostUsd!: number;

  @ApiProperty({ minimum: 0, example: 2500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  marketingCostUsd!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
