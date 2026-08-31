import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TeamPermission } from '../../../common/enums/team-permission.enum';
import { TeamRole } from '../../../common/enums/team-role.enum';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTeamMemberDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(TeamPermission, { each: true })
  permissions!: TeamPermission[];

  // Optional — defaults to SUB_ADMIN. Whether the inviter is actually
  // allowed to grant the requested role is enforced in TeamService, since
  // it depends on the inviter's own role in the hierarchy.
  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;
}
