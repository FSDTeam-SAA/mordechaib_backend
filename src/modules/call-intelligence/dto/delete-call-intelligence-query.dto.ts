import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AiProposalSourceType } from '../../../database/schemas/ai-action-proposal.schema';
import { CALL_INTELLIGENCE_SOURCE_TYPES } from './get-call-intelligence-query.dto';

export class DeleteCallIntelligenceQueryDto {
  @ApiProperty({ enum: CALL_INTELLIGENCE_SOURCE_TYPES })
  @IsIn(CALL_INTELLIGENCE_SOURCE_TYPES)
  sourceType!: AiProposalSourceType;
}
