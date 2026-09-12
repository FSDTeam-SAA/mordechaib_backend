import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  AiActionProposalStatus,
  AiProposalSourceType,
} from '../../../database/schemas/ai-action-proposal.schema';

export const CALL_INTELLIGENCE_SOURCE_TYPES = [
  AiProposalSourceType.CALL_AUDIO,
  AiProposalSourceType.CALL_TRANSCRIPT,
  AiProposalSourceType.ZOOM_MEETING,
  AiProposalSourceType.GOOGLE_MEET,
] as const;

export class GetCallIntelligenceQueryDto {
  @ApiProperty({ enum: CALL_INTELLIGENCE_SOURCE_TYPES })
  @IsIn(CALL_INTELLIGENCE_SOURCE_TYPES)
  sourceType!: AiProposalSourceType;

  @ApiPropertyOptional({ enum: AiActionProposalStatus, default: 'PENDING' })
  @IsOptional()
  @IsEnum(AiActionProposalStatus)
  status: AiActionProposalStatus = AiActionProposalStatus.PENDING;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  taskLimit = 4;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  meetingLimit = 4;

  @ApiPropertyOptional({ default: false })
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  includeTranscript = false;
}

export class DownloadCallIntelligenceReportQueryDto extends GetCallIntelligenceQueryDto {
  @ApiPropertyOptional({ enum: ['html', 'json'], default: 'html' })
  @IsOptional()
  @IsIn(['html', 'json'])
  format: 'html' | 'json' = 'html';
}

export class DownloadCallAudioQueryDto {
  @ApiProperty({
    enum: [
      AiProposalSourceType.CALL_AUDIO,
      AiProposalSourceType.CALL_TRANSCRIPT,
    ],
  })
  @IsIn([
    AiProposalSourceType.CALL_AUDIO,
    AiProposalSourceType.CALL_TRANSCRIPT,
  ])
  sourceType!: AiProposalSourceType;
}
