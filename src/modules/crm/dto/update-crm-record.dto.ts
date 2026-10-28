import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsObject, IsOptional } from 'class-validator';

export class UpdateCrmRecordDto {
  @ApiProperty({
    type: Object,
    description:
      'Provider field names and values validated against the connected account schema',
    example: { name: 'Premium plan', price: 250 },
  })
  @IsObject()
  properties!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Provider update timestamp returned by the record API. When supplied, the update is rejected if the synchronized record has changed.',
    example: '2026-10-27T09:59:20.479Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedProviderUpdatedAt?: string;
}
