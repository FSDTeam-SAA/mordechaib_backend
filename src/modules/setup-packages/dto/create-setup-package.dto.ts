import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SetupFeeType } from '../../../common/enums/setup-fee-type.enum';
import { SetupType } from '../../../common/enums/setup-type.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class CreateSetupPackageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/, {
    message:
      'code must contain uppercase letters, numbers, and underscores only',
  })
  code!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(SetupType)
  setupType!: SetupType;

  @IsEnum(SetupFeeType)
  setupFeeType!: SetupFeeType;

  @IsNumber()
  @Min(0)
  price!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a three-letter ISO currency code',
  })
  currency!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
