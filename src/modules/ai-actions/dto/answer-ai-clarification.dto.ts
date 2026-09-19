import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AnswerAiClarificationDto {
  @ApiProperty({ example: 'meeting-start-time', maxLength: 128 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  questionId!: string;

  @ApiProperty({
    example: '2026-09-18T10:00:00+06:00',
    maxLength: 2000,
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer!: string;
}
