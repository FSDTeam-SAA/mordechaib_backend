import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class GenerateExecutiveBriefingDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Generate the briefing for the local period containing this timestamp. Defaults to now.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  asOf?: string;
}
