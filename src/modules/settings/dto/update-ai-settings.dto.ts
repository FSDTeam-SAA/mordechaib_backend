import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { AiResponseStyle } from '../../../common/enums/ai-response-style.enum';

export class UpdateAiSettingsDto {
  @IsBoolean()
  @IsOptional()
  autoApproveLowRiskActions?: boolean;

  @IsBoolean()
  @IsOptional()
  learningMode?: boolean;

  @IsBoolean()
  @IsOptional()
  agentActivityNotifications?: boolean;

  @IsEnum(AiResponseStyle)
  @IsOptional()
  responseStyle?: AiResponseStyle;
}
