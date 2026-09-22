import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetAiInsightsQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Defaults to 24 hours ago.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to now.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class ListAgentActivityQueryDto extends GetAiInsightsQueryDto {
  @ApiPropertyOptional({ type: Number, default: 50, minimum: 1, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit = 50;
}
