import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContactEnquiryStatus } from '../../../common/enums/contact-enquiry-status.enum';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class UpdateContactEnquiryDto {
  @ApiProperty({ minimum: 1, description: 'Current enquiry revision' })
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  role?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message?: string;

  @ApiPropertyOptional({ enum: ContactEnquiryStatus })
  @IsOptional()
  @IsEnum(ContactEnquiryStatus)
  status?: ContactEnquiryStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(5000)
  internalNote?: string;
}
