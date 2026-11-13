import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsDate,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../../common/enums/admin-meeting-status.enum';
import { MeetingType } from '../../../common/enums/meeting-type.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class AdminMeetingCalendarQueryDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Inclusive UTC start of the requested calendar window.',
  })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({
    format: 'date-time',
    description: 'Exclusive UTC end of the requested calendar window.',
  })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiProperty({ example: 'Asia/Dhaka' })
  @Transform(trimString)
  @IsTimeZone()
  timezone!: string;

  @ApiPropertyOptional({
    description: 'Limit results to one organization.',
  })
  @IsOptional()
  @IsMongoId()
  organizationId?: string;

  @ApiPropertyOptional({ enum: AdminMeetingStatus })
  @IsOptional()
  @IsEnum(AdminMeetingStatus)
  status?: AdminMeetingStatus;

  @ApiPropertyOptional({ enum: AdminMeetingSourceType })
  @IsOptional()
  @IsEnum(AdminMeetingSourceType)
  sourceType?: AdminMeetingSourceType;

  @ApiPropertyOptional({ enum: MeetingType })
  @IsOptional()
  @IsEnum(MeetingType)
  meetingType?: MeetingType;

  @ApiPropertyOptional({
    description: 'Case-insensitive title, attendee, or organization search.',
    maxLength: 120,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
