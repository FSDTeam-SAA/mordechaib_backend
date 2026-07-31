import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SetupStatus } from '../../../common/enums/setup-status.enum';

export class ChangeSetupStatusDto {
  @IsEnum(SetupStatus)
  status!: SetupStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}