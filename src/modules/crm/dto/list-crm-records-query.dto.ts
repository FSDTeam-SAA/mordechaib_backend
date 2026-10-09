import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { CrmProviderType } from '../../../common/types/crm-provider.interface';
import { IntegrationProvider } from '../../../database/schemas/integration.schema';

const CRM_PROVIDERS: CrmProviderType[] = [
  IntegrationProvider.HUBSPOT,
  IntegrationProvider.SALESFORCE,
];
const CRM_OBJECT_TYPE_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;

export class ListCrmRecordsQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: CRM_PROVIDERS })
  @IsOptional()
  @IsIn(CRM_PROVIDERS)
  provider?: CrmProviderType;

  @ApiPropertyOptional({
    example: 'Contact',
    description:
      'Exact provider object identifier, such as contacts, Account, or Project__c.',
  })
  @IsOptional()
  @IsString()
  @Matches(CRM_OBJECT_TYPE_PATTERN)
  objectType?: string;

  @ApiPropertyOptional({
    description: 'Exact record identifier assigned by the CRM provider.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'Return archived/deleted records instead of active records when true.',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsOptional()
  @IsBoolean()
  archived: boolean = false;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Inclusive lower bound for the provider update timestamp.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  updatedFrom?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Inclusive upper bound for the provider update timestamp.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  updatedTo?: string;
}
