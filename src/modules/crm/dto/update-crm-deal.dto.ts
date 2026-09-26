import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCrmDealDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerStage?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  closeDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ownerId?: string;
}
