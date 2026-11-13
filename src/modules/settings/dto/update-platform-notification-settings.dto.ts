import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';

const normalizeRecipients = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((email) =>
        typeof email === 'string' ? email.trim().toLowerCase() : email,
      )
    : value;

export class UpdatePlatformNotificationSettingsDto {
  @ApiProperty({
    minimum: 0,
    description: 'Revision returned by GET /platform/settings/notifications.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newOrganizationRegistered?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  subscriptionPaymentReceived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  failedPayment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  userReportedIssue?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  agentErrorDetected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  systemHealthAlert?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['admin@noltra.ai', 'ops@noltra.ai'],
    description:
      'Platform operational-alert recipients. Send an empty array to disable email delivery while retaining event switches.',
  })
  @Transform(normalizeRecipients)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  emailRecipients?: string[];
}
