import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TeamMemberStatus } from '../../../common/enums/team-member-status.enum';
import { TeamRole } from '../../../common/enums/team-role.enum';

export class ListTeamMembersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TeamMemberStatus)
  status?: TeamMemberStatus;

  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;
}
