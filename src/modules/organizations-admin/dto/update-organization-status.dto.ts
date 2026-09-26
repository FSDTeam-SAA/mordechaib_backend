import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrganizationStatus } from '../../../common/enums/organization-status.enum';

export class UpdateOrganizationStatusDto {
  @IsEnum(OrganizationStatus)
  status!: OrganizationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
