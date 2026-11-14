import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BusinessMemoryKind } from '../../../common/enums/business-memory.enum';

export class CreateBusinessMemoryDto {
  @ApiProperty({ enum: BusinessMemoryKind })
  @IsEnum(BusinessMemoryKind)
  kind!: BusinessMemoryKind;

  @ApiProperty({
    maxLength: 1_000,
    example: 'Kongkon prefers proposals by email before any call.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  content!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Customer (contact) ids this memory is about',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsMongoId({ each: true })
  contactIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Team members this memory is about',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsMongoId({ each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    example: '2026-11-20',
    description: 'Local due date of a commitment or open item',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueOn?: string;
}
