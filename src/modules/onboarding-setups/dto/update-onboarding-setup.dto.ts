import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRequirementsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  teamSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsEnum(['HUBSPOT', 'SALESFORCE', 'OTHER', 'NONE'])
  crmProvider?: string;

  @IsOptional()
  @IsEnum(['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR', 'NONE'])
  calendarProvider?: string;

  @IsOptional()
  @IsEnum(['TWILIO', 'NONE'])
  callingProvider?: string;

  @IsOptional()
  @IsBoolean()
  needCrmMigration?: boolean;

  @IsOptional()
  @IsBoolean()
  needCalendarSetup?: boolean;

  @IsOptional()
  @IsBoolean()
  needTwilioSetup?: boolean;

  @IsOptional()
  @IsBoolean()
  needAiAgentSetup?: boolean;

  @IsOptional()
  @IsBoolean()
  needWorkflowSetup?: boolean;

  @IsOptional()
  @IsBoolean()
  needTeamOnboarding?: boolean;
}

export class UpdateOnboardingSetupDto {
  @IsOptional()
  @Type(() => UpdateRequirementsDto)
  requirements?: UpdateRequirementsDto;
}