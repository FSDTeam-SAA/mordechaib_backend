import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  AiActionProposalStatus,
  AiActionType,
} from '../../../database/schemas/ai-action-proposal.schema';

export class ListAiActionProposalsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(AiActionProposalStatus)
  status?: AiActionProposalStatus;

  @IsOptional()
  @IsEnum(AiActionType)
  actionType?: AiActionType;

  @IsOptional()
  @IsString()
  proposedByAgentId?: string;
}
