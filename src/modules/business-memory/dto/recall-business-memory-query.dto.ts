import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;

/** AI-internal recall: ACTIVE memories relevant to one chat turn. */
export class RecallBusinessMemoryQueryDto {
  @ApiProperty({ description: 'The authenticated organizer of the turn' })
  @IsMongoId()
  requesterUserId!: string;

  @ApiPropertyOptional({
    description: 'Comma-separated customer ids involved in the turn',
    example: '6af40fef9ff07abe4d79f244',
  })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(10)
  @IsMongoId({ each: true })
  contactIds?: string[];

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'Free text, usually the organizer message',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  search?: string;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit = 20;
}
