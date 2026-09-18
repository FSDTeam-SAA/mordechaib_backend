import { ApiPropertyOptional } from '@nestjs/swagger';
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
  AiActionType,
  AiProposalSourceType,
} from '../../../database/schemas/ai-action-proposal.schema';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListAiActionProposalsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: AiActionProposalStatus })
  @IsOptional()
  @IsEnum(AiActionProposalStatus)
  status?: AiActionProposalStatus;

  @ApiPropertyOptional({ enum: AiActionType })
  @IsOptional()
  @IsEnum(AiActionType)
  actionType?: AiActionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proposedByAgentId?: string;

  @ApiPropertyOptional({
    description: 'Filter proposals produced from one call, meeting, or message',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sourceId?: string;

  @ApiPropertyOptional({ enum: AiProposalSourceType })
  @IsOptional()
  @IsEnum(AiProposalSourceType)
  sourceType?: AiProposalSourceType;
}
