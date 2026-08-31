import { ArrayNotEmpty, IsArray, IsEnum, IsOptional } from 'class-validator';
import { TeamMemberStatus } from '../../../common/enums/team-member-status.enum';
import { TeamPermission } from '../../../common/enums/team-permission.enum';
import { TeamRole } from '../../../common/enums/team-role.enum';

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TeamPermission, { each: true })
  permissions?: TeamPermission[];

  @IsOptional()
  @IsEnum(TeamMemberStatus)
  status?: TeamMemberStatus;

  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;
}
