import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateDiagnosticQuestionDto } from './create-diagnostic-question.dto';

export class BulkCreateDiagnosticQuestionsDto {
  @ApiProperty({ type: [CreateDiagnosticQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDiagnosticQuestionDto)
  questions!: CreateDiagnosticQuestionDto[];
}
