import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PackageInquiryStatus } from '../../../common/enums/package-inquiry-status.enum';
import { PackageType } from '../../../common/enums/package-type.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class ListSalesQueriesDto {
  @ApiPropertyOptional({ enum: PackageType })
  @IsOptional()
  @IsEnum(PackageType)
  packageType?: PackageType;

  @ApiPropertyOptional({ enum: PackageInquiryStatus })
  @IsOptional()
  @IsEnum(PackageInquiryStatus)
  status?: PackageInquiryStatus;

  @ApiPropertyOptional({ description: 'Search name, email, or message' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
