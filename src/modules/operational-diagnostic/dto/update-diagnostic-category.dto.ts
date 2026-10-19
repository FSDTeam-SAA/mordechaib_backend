import { PartialType } from '@nestjs/swagger';
import { CreateDiagnosticCategoryDto } from './create-diagnostic-category.dto';

export class UpdateDiagnosticCategoryDto extends PartialType(
  CreateDiagnosticCategoryDto,
) {}
