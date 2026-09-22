import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class GetExecutiveBriefingQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Return the latest briefing whose period contains this timestamp. Defaults to now.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  asOf?: string;
}
