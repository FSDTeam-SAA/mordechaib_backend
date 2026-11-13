import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CustomerLeadStatus } from '../../../common/enums/customer-lead-status.enum';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lowercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const phone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()-]/g, '').trim() : value;

export class CreateContactDto {
  @ApiProperty({ example: 'Tahid Rahman', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'tahid@example.com' })
  @Transform(lowercase)
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: '+8801812345678' })
  @Transform(phone)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: 'Acme Ltd.' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiPropertyOptional({ example: 'Operations Director' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/example/image/upload/customer.png',
    maxLength: 500,
  })
  @Transform(trim)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'New York, USA', maxLength: 300 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiPropertyOptional({ example: 'https://example.com', maxLength: 500 })
  @Transform(trim)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({
    example: 'https://www.linkedin.com/in/example',
    maxLength: 500,
  })
  @Transform(trim)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  linkedinUrl?: string;

  @ApiPropertyOptional({
    enum: CustomerLeadStatus,
    default: CustomerLeadStatus.NEW,
  })
  @IsOptional()
  @IsEnum(CustomerLeadStatus)
  leadStatus?: CustomerLeadStatus;

  @ApiPropertyOptional({ maxLength: 5000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ type: [String], example: ['priority', 'customer'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}
