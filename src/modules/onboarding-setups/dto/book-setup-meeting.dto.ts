import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BookSetupMeetingDto {
  @ApiProperty({
    example: '2026-10-01T03:00:00.000Z',
    description: 'Exact startTime returned by the available-slots endpoint.',
  })
  @IsDateString()
  startTime!: string;

  // Backward-compatible only. The server calculates the end time from the
  // active availability rule and rejects a conflicting client value.
  @ApiPropertyOptional({
    example: '2026-10-01T04:30:00.000Z',
    deprecated: true,
    description: 'Optional compatibility field; the server calculates endTime.',
  })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ example: 'Asia/Dhaka' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({
    example: 'Please discuss our CRM migration requirements.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
