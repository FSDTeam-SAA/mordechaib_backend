import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IntegrationProvider } from '../../../database/schemas/integration.schema';

export class CrmRecordUpdatePreviewDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  recordId!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  before!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  @IsObject()
  after!: Record<string, unknown>;
}

export class UpdateCrmRecordActionDto {
  @ApiProperty({
    enum: [IntegrationProvider.HUBSPOT, IntegrationProvider.SALESFORCE],
  })
  @IsIn([IntegrationProvider.HUBSPOT, IntegrationProvider.SALESFORCE])
  provider!:
    | IntegrationProvider.HUBSPOT
    | IntegrationProvider.SALESFORCE;

  @ApiProperty({ example: 'products' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,160}$/)
  objectType!: string;

  @ApiProperty({ description: 'Provider-assigned record identifier' })
  @IsString()
  @MaxLength(255)
  externalId!: string;

  @ApiProperty({
    type: Object,
    description: 'Only fields proposed for mutation',
  })
  @IsObject()
  properties!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Optimistic concurrency timestamp from the synchronized source record',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedProviderUpdatedAt?: string;

  @ApiPropertyOptional({ readOnly: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  schemaFingerprint?: string;

  @ApiPropertyOptional({ type: CrmRecordUpdatePreviewDto, readOnly: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CrmRecordUpdatePreviewDto)
  preview?: CrmRecordUpdatePreviewDto;
}
