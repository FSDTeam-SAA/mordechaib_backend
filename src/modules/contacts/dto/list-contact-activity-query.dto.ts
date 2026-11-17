import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListContactActivityQueryDto {
  @ApiPropertyOptional({ type: Number, default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;

  @ApiPropertyOptional({
    type: String,
    description: 'Opaque cursor returned by the previous response',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cursor?: string;
}
