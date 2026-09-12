import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAgentCatalogQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 100;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
