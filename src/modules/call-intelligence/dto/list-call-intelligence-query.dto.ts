import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AiProposalSourceType } from '../../../database/schemas/ai-action-proposal.schema';

export enum CallIntelligenceItemKind {
  CALL = 'CALL',
  MEETING = 'MEETING',
}

export const CALL_INTELLIGENCE_LIST_SOURCE_TYPES = [
  AiProposalSourceType.CALL_TRANSCRIPT,
  AiProposalSourceType.ZOOM_MEETING,
  AiProposalSourceType.GOOGLE_MEET,
] as const;

export class ListCallIntelligenceQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ enum: CallIntelligenceItemKind })
  @IsEnum(CallIntelligenceItemKind)
  @IsOptional()
  kind?: CallIntelligenceItemKind;

  @ApiPropertyOptional({ enum: CALL_INTELLIGENCE_LIST_SOURCE_TYPES })
  @IsIn(CALL_INTELLIGENCE_LIST_SOURCE_TYPES)
  @IsOptional()
  sourceType?: AiProposalSourceType;
}
