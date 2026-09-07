import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TaskAttachmentKind } from '../../../common/enums/task-attachment-kind.enum';

export class TaskDependencyDto {
  @ApiProperty({ example: 'Finance to provide latest supplier numbers' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isComplete?: boolean;
}

export class TaskAttachmentDto {
  @ApiProperty({ example: 'supplier-pricing.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    example: 'https://cdn.example.com/tasks/supplier-pricing.pdf',
  })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({
    enum: TaskAttachmentKind,
    default: TaskAttachmentKind.FILE,
  })
  @IsOptional()
  @IsEnum(TaskAttachmentKind)
  kind?: TaskAttachmentKind;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @ApiPropertyOptional({ minimum: 0, example: 124000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10737418240)
  sizeBytes?: number;
}

export class RequiredTaskAttachmentDto {
  @ApiProperty({ example: 'Signed customer contract' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isComplete?: boolean;
}

export class TaskAiAssistanceDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  generateChecklist?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  suggestNextSteps?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  recommendDeadline?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoCreateSubtasks?: boolean;
}

export class TaskReminderDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 40320, example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40320)
  minutesBeforeDue?: number;
}

export class TaskSubtaskDto {
  @ApiProperty({ example: 'Validate margin calculations' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isComplete?: boolean;

  @ApiPropertyOptional({ example: '2026-09-18T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;
}
