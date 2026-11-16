import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export enum ContactSalesSubject {
  PRICING = 'PRICING',
  FEATURES = 'FEATURES',
  ENTERPRISE = 'ENTERPRISE',
  GENERAL = 'GENERAL',
  OTHER = 'OTHER',
}

export class ContactSalesDto {
  @ApiProperty({
    enum: ContactSalesSubject,
    description: 'Topic the user wants to discuss with the sales team',
    example: ContactSalesSubject.PRICING,
  })
  @IsEnum(ContactSalesSubject)
  subject!: ContactSalesSubject;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string;
}
