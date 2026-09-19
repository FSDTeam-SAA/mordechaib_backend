import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ExecutiveBriefingType } from '../../../common/enums/executive-briefing.enum';

export class CreateStrategicNoteDto {
  @ApiProperty({ maxLength: 5_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  content!: string;

  @ApiPropertyOptional({
    enum: ExecutiveBriefingType,
    isArray: true,
    description: 'Defaults to all briefing types.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsEnum(ExecutiveBriefingType, { each: true })
  appliesTo?: ExecutiveBriefingType[];

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to now.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  validFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  validUntil?: string;
}
