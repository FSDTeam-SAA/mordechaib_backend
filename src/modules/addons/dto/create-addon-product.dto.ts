import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AddonCategory } from '../../../common/enums/addon-category.enum';

export class AddonTierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label!: string;

  // Machine-readable quantity — actions count, voice minutes, meeting hours, etc.
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  priceUsd!: number;
}

export class CreateAddonProductDto {
  @IsEnum(AddonCategory)
  category!: AddonCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  // When true the add-on is shown in the UI but checkout is disabled;
  // the user must "Contact Sales". Useful for Operations Booster Pack.
  @IsOptional()
  @IsBoolean()
  isInquiryOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddonTierDto)
  tiers!: AddonTierDto[];
}
