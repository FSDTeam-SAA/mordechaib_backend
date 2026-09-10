import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AnswerAiClarificationDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  questionId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer!: string;
}
