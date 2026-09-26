import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  SupportRequestCategory,
  SupportRequestStatus,
} from '../../../common/enums/support-request.enum';

export class ListSupportRequestsQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ enum: SupportRequestStatus })
  @IsEnum(SupportRequestStatus)
  @IsOptional()
  status?: SupportRequestStatus;

  @ApiPropertyOptional({ enum: SupportRequestCategory })
  @IsEnum(SupportRequestCategory)
  @IsOptional()
  category?: SupportRequestCategory;
}
