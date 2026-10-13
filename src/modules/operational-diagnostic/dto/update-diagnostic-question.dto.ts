import { PartialType } from '@nestjs/swagger';
import { CreateDiagnosticQuestionDto } from './create-diagnostic-question.dto';

export class UpdateDiagnosticQuestionDto extends PartialType(
  CreateDiagnosticQuestionDto,
) {}

