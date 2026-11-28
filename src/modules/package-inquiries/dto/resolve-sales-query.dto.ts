import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PackageInquiryStatus } from '../../../common/enums/package-inquiry-status.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class ResolveSalesQueryDto {
  @ApiProperty({
    enum: PackageInquiryStatus,
    description: 'New status for this sales query',
    example: PackageInquiryStatus.CONTACTED,
  })
  @IsEnum(PackageInquiryStatus)
  status!: PackageInquiryStatus;

  @ApiPropertyOptional({
    description: 'Internal admin resolution note',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  note?: string;
}
