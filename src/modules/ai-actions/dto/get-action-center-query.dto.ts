import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AiActionProposalStatus,
  AiProposalSourceType,
} from '../../../database/schemas/ai-action-proposal.schema';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ActionCenterParamsDto {
  @ApiProperty({ example: 'call-or-meeting-source-id', maxLength: 200 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sourceId!: string;
}

export class GetActionCenterQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  taskLimit: number = 4;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  meetingLimit: number = 4;

  @ApiPropertyOptional({
    enum: AiActionProposalStatus,
    default: AiActionProposalStatus.PENDING,
  })
  @IsEnum(AiActionProposalStatus)
  status: AiActionProposalStatus = AiActionProposalStatus.PENDING;

  @ApiPropertyOptional({ enum: AiProposalSourceType })
  @IsOptional()
  @IsEnum(AiProposalSourceType)
  sourceType?: AiProposalSourceType;
}
