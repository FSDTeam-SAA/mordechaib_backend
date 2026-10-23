import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum CrmSchemaView {
  ESSENTIAL = 'ESSENTIAL',
  FULL = 'FULL',
}

export class GetCrmObjectSchemaQueryDto {
  @ApiPropertyOptional({
    enum: CrmSchemaView,
    default: CrmSchemaView.ESSENTIAL,
  })
  @IsOptional()
  @IsEnum(CrmSchemaView)
  view: CrmSchemaView = CrmSchemaView.ESSENTIAL;

  @ApiPropertyOptional({
    description: 'Case-insensitive field name or label search.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    default: 50,
    minimum: 1,
    maximum: 200,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
