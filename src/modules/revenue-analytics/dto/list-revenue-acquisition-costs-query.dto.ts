import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';
import { RevenueAcquisitionChannel } from '../revenue-analytics.enums';

export class ListRevenueAcquisitionCostsQueryDto {
  @ApiPropertyOptional({ example: '2026-01' })
  @Transform(trimString)
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  fromPeriod?: string;

  @ApiPropertyOptional({ example: '2026-12' })
  @Transform(trimString)
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  toPeriod?: string;

  @ApiPropertyOptional({ enum: RevenueAcquisitionChannel })
  @IsOptional()
  @IsEnum(RevenueAcquisitionChannel)
  channel?: RevenueAcquisitionChannel;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
