import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BusinessMemoryKind,
  BusinessMemoryStatus,
} from '../../../common/enums/business-memory.enum';

export class ListBusinessMemoriesQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({
    enum: BusinessMemoryStatus,
    description: 'PENDING_REVIEW lists what Laura learned and awaits review',
  })
  @IsOptional()
  @IsEnum(BusinessMemoryStatus)
  status?: BusinessMemoryStatus;

  @ApiPropertyOptional({ enum: BusinessMemoryKind })
  @IsOptional()
  @IsEnum(BusinessMemoryKind)
  kind?: BusinessMemoryKind;

  @ApiPropertyOptional({ description: 'Only memories about this customer' })
  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
