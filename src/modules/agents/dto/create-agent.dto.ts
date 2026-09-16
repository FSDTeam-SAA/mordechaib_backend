import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AgentType } from '../../../common/enums/agent-type.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class CreateAgentDto {
  @ApiProperty({ example: 'Sales Agent', maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/agents/sales-agent.png',
    maxLength: 500,
  })
  @Transform(trimString)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  imageUrl?: string;

  @ApiProperty({ enum: AgentType, example: AgentType.SALES })
  @IsEnum(AgentType)
  type!: AgentType;
}
