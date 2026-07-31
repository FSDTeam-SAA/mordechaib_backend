import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';
import { SetupStatus } from '../../../common/enums/setup-status.enum';
import { SetupType } from '../../../common/enums/setup-type.enum';

export class OnboardingSetupQueryDto {
  @IsOptional()
  @IsEnum(SetupStatus)
  status?: SetupStatus;

  @IsOptional()
  @IsEnum(PlanType)
  packageType?: PlanType;

  @IsOptional()
  @IsEnum(SetupType)
  setupType?: SetupType;

  @IsOptional()
  @IsString()
  assignedAdminId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}