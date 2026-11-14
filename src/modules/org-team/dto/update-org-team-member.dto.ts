import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { OrgPermission } from '../../../common/enums/org-permission.enum';

export class UpdateOrgTeamMemberDto {
  @ApiPropertyOptional({ example: 'Sarah Jenkins' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    enum: [UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER],
    description: 'Updated role inside the organization',
  })
  @IsOptional()
  @IsEnum([UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER], {
    message: 'Role must be ADMIN, MEMBER, or VIEWER',
  })
  role?: UserRole;

  @ApiPropertyOptional({
    enum: OrgPermission,
    isArray: true,
    description: 'Updated tab permissions for the user dashboard',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(OrgPermission, { each: true })
  permissions?: OrgPermission[];

  @ApiPropertyOptional({
    enum: UserStatus,
    description: 'Account status (ACTIVE or SUSPENDED)',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
