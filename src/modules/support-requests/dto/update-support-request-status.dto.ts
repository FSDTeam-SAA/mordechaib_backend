import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SupportRequestStatus } from '../../../common/enums/support-request.enum';

export class UpdateSupportRequestStatusDto {
  @ApiProperty({ enum: SupportRequestStatus })
  @IsEnum(SupportRequestStatus)
  status!: SupportRequestStatus;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2_000)
  @IsOptional()
  resolutionNote?: string;
}
