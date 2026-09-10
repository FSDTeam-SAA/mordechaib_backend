import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AgentType } from '../../../common/enums/agent-type.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class ListAgentsQueryDto {
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
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(AgentType)
  type?: AgentType;
}
