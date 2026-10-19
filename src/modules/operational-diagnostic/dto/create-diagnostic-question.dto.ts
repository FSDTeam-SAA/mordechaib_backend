import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DiagnosticChoiceDto {
  @ApiProperty({ example: 'A', description: 'Choice label (A, B, C, D)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  label!: string;

  @ApiProperty({
    example: 'Unwritten/informal; relies heavily on individual memory.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text!: string;

  @ApiProperty({ example: 0, description: 'Points awarded for this choice' })
  @IsNumber()
  @Min(0)
  points!: number;
}

export class CreateDiagnosticQuestionDto {
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @IsMongoId()
  categoryId!: string;

  @ApiProperty({ example: 'SOP Adoption & Workflow Rigor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({
    example:
      'How documented, accessible, and enforced are your core operational processes?',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [DiagnosticChoiceDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosticChoiceDto)
  choices!: DiagnosticChoiceDto[];
}
