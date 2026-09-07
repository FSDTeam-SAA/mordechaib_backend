import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TaskDepartment } from '../../../common/enums/task-department.enum';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import {
  RequiredTaskAttachmentDto,
  TaskAiAssistanceDto,
  TaskAttachmentDto,
  TaskDependencyDto,
  TaskReminderDto,
  TaskSubtaskDto,
} from './task-nested.dto';

export class CreateTaskDto {
  @ApiProperty({ example: 'Prepare Q3 pricing sheet', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    example: 'Validate supplier pricing and margin calculations.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ example: '66cc9bdfa847ea856c7b41d2' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  assignedToUserId?: string;

  @ApiPropertyOptional({ enum: TaskDepartment })
  @IsOptional()
  @IsEnum(TaskDepartment)
  department?: TaskDepartment;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TODO })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ example: '2026-09-20T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 525600, example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(525600)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['66cc9bdfa847ea856c7b41d2'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  stakeholderIds?: string[];

  @ApiPropertyOptional({ type: () => [TaskDependencyDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TaskDependencyDto)
  dependencies?: TaskDependencyDto[];

  @ApiPropertyOptional({ type: () => [TaskAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TaskAttachmentDto)
  attachments?: TaskAttachmentDto[];

  @ApiPropertyOptional({ type: () => [RequiredTaskAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequiredTaskAttachmentDto)
  requiredAttachments?: RequiredTaskAttachmentDto[];

  @ApiPropertyOptional({ type: () => TaskAiAssistanceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaskAiAssistanceDto)
  aiAssistance?: TaskAiAssistanceDto;

  @ApiPropertyOptional({ type: () => TaskReminderDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaskReminderDto)
  reminder?: TaskReminderDto;

  @ApiPropertyOptional({ type: () => [TaskSubtaskDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TaskSubtaskDto)
  subtasks?: TaskSubtaskDto[];

  @ApiPropertyOptional({ type: [String], example: ['#Finance'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}
