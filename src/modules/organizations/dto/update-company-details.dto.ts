import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

export class UpdateCompanyDetailsDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  companyName!: string;

  @Transform(trimString)
  @IsUrl({ require_protocol: true })
  @IsOptional()
  @MaxLength(500)
  website?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  @Matches(PHONE_PATTERN, {
    message: 'phoneNumber must be a valid international number',
  })
  phoneNumber!: string;

  @Matches(TIME_PATTERN, {
    message: 'businessHoursStart must use HH:mm format',
  })
  businessHoursStart!: string;

  @Matches(TIME_PATTERN, { message: 'businessHoursEnd must use HH:mm format' })
  businessHoursEnd!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;
}
