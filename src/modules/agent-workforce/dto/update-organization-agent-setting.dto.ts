import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateOrganizationAgentSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 100,
    description:
      'Configured parallel-run capacity. This does not fabricate queue telemetry.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  concurrencyLimit?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;
}
