import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IntegrationSetupStatus } from '../../../common/enums/integration-setup-status.enum';

export class SetupSectionUpdateDto {
  @IsOptional()
  @IsEnum(IntegrationSetupStatus)
  status?: IntegrationSetupStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateSetupProgressDto {
  @IsOptional()
  @Type(() => SetupSectionUpdateDto)
  crmSetup?: SetupSectionUpdateDto;

  @IsOptional()
  @Type(() => SetupSectionUpdateDto)
  calendarSetup?: SetupSectionUpdateDto;

  @IsOptional()
  @Type(() => SetupSectionUpdateDto)
  twilioSetup?: SetupSectionUpdateDto;

  @IsOptional()
  @Type(() => SetupSectionUpdateDto)
  aiAgentSetup?: SetupSectionUpdateDto;

  @IsOptional()
  @Type(() => SetupSectionUpdateDto)
  workflowSetup?: SetupSectionUpdateDto;

  @IsOptional()
  @Type(() => SetupSectionUpdateDto)
  teamOnboarding?: SetupSectionUpdateDto;
}