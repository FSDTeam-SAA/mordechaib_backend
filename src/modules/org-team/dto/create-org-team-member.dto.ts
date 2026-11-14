import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { OrgPermission } from '../../../common/enums/org-permission.enum';

export class CreateOrgTeamMemberDto {
  @ApiProperty({
    example: 'Sarah Jenkins',
    description: 'Full name of the team member',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'sarah@acme.com',
    description: 'Work email address of the team member',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({
    enum: [UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER],
    default: UserRole.MEMBER,
    description: 'Assigned role in the organization. Cannot invite directly as OWNER.',
  })
  @IsOptional()
  @IsEnum([UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER], {
    message: 'Role must be ADMIN, MEMBER, or VIEWER',
  })
  role?: UserRole;

  @ApiPropertyOptional({
    enum: OrgPermission,
    isArray: true,
    description:
      'Sidebar tabs and modules the team member has permission to access',
    example: [
      OrgPermission.DASHBOARD,
      OrgPermission.CALL_INTELLIGENCE,
      OrgPermission.CUSTOMER,
      OrgPermission.AI_AGENTS,
    ],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(OrgPermission, { each: true })
  permissions?: OrgPermission[];
}
