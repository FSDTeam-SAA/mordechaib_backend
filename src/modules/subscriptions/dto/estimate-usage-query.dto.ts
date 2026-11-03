import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class EstimateUsageQueryDto {
  @ApiPropertyOptional({
    description: 'Monthly AI actions needed (e.g. 3000)',
    example: 3000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyActions?: number;

  @ApiPropertyOptional({
    description: 'Alias for monthlyActions',
    example: 3000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  aiActions?: number;

  @ApiPropertyOptional({
    description: 'Monthly call minutes needed (e.g. 200)',
    example: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyCalls?: number;

  @ApiPropertyOptional({
    description: 'Alias for monthlyCalls in minutes',
    example: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  callMinutes?: number;

  @ApiPropertyOptional({
    description: 'Monthly AI meetings count (e.g. 20 or 160)',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyMeetings?: number;

  @ApiPropertyOptional({
    description: 'Alias for monthlyMeetings',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  aiMeetings?: number;

  @ApiPropertyOptional({
    description: 'Legacy alias for monthly meeting hours / count',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  meetingHours?: number;

  @ApiPropertyOptional({
    description: 'Optional custom assumption rate per AI meeting (defaults to 1.00)',
    example: 1.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  meetingRateUsd?: number;
}
