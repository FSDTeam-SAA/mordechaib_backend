import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TwilioCountry } from '../../../common/enums/twilio-country.enum';

export class SearchTwilioNumbersDto {
  @IsEnum(TwilioCountry)
  country!: TwilioCountry;

  @Type(() => Number)
  @IsInt()
  @Min(200)
  @Max(999)
  @IsOptional()
  areaCode?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(16)
  @Matches(/^[+%*$a-zA-Z0-9]+$/)
  @IsOptional()
  contains?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  @IsOptional()
  locality?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(10)
  @IsOptional()
  region?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit: number = 20;
}
