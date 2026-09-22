import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class OnboardingAvailableSlotsQueryDto {
  @ApiProperty({
    example: '2026-10-01',
    description: 'Date in the configured onboarding availability timezone.',
  })
  @IsString()
  @Matches(LOCAL_DATE_PATTERN, { message: 'date must use YYYY-MM-DD format' })
  date!: string;

  @ApiPropertyOptional({
    example: 'Asia/Dhaka',
    description: 'Frontend display timezone; returned slots remain ISO UTC.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;
}
