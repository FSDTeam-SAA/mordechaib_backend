import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  SupportRequestPriority,
  SupportRequestStatus,
} from '../../../common/enums/support-request.enum';

export class ManageSupportRequestDto {
  @ApiPropertyOptional({ enum: SupportRequestStatus })
  @IsEnum(SupportRequestStatus)
  @IsOptional()
  status?: SupportRequestStatus;

  @ApiPropertyOptional({ enum: SupportRequestPriority })
  @IsEnum(SupportRequestPriority)
  @IsOptional()
  priority?: SupportRequestPriority;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Platform-admin user ID. Send null to unassign.',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsMongoId()
  assignedToUserId?: string | null;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2_000)
  @IsOptional()
  resolutionNote?: string;
}
