import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DiagnosticAnswerDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @IsMongoId()
  questionId!: string;

  @ApiProperty({ example: 'C', description: 'The selected choice label' })
  @IsString()
  @IsNotEmpty()
  selectedChoiceLabel!: string;
}

export class SubmitDiagnosticAssessmentDto {
  @ApiProperty({ type: [DiagnosticAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosticAnswerDto)
  answers!: DiagnosticAnswerDto[];
}

