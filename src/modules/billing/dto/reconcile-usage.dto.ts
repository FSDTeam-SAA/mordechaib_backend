import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ReconcileUsageDto {
  @ApiPropertyOptional({
    description:
      'Inclusive billing-period start. Omit both dates for current subscription period.',
    example: '2026-11-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({
    description:
      'Exclusive billing-period end. Must be supplied with periodStart.',
    example: '2026-12-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
