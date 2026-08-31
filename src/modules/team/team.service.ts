import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { isValidObjectId } from 'mongoose';
import { TeamMemberStatus } from '../../common/enums/team-member-status.enum';
import { TeamRole } from '../../common/enums/team-role.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { generateTempPassword } from '../../common/helpers/generate-temp-password.helper';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { getTeamInviteTemplate } from '../../common/templates/team-invite.template';
import { RequestUser } from '../../common/types/request-context.type';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { ListTeamMembersQueryDto } from './dto/list-team-members-query.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamRepository } from './team.repository';

// Which roles an inviter of a given role is allowed to grant to a new (or
// promoted) team member. This is the "if an admin invites someone it should
// come out as sub-admin" rule: ADMIN can only ever produce SUB_ADMIN.
const GRANTABLE_ROLES: Record<TeamRole, TeamRole[]> = {
  [TeamRole.SUPER_ADMIN]: [
    TeamRole.SUPER_ADMIN,
    TeamRole.ADMIN,
    TeamRole.SUB_ADMIN,
  ],
  [TeamRole.ADMIN]: [TeamRole.SUB_ADMIN],
  [TeamRole.SUB_ADMIN]: [],
};

function humanizeRole(role: TeamRole): string {
  return role.replace('_', ' ').toLowerCase();
}

// Cosmetic mapping only, used to populate the login (`users`) profile.
// The team_members collection stays the single source of truth for
// hierarchy decisions (see GRANTABLE_ROLES / assertCanManage) and for the
// actual sidebar permissions the frontend renders.
function toUserRole(role: TeamRole): UserRole {
  return role === TeamRole.SUB_ADMIN ? UserRole.MEMBER : UserRole.ADMIN;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') || firstName };
}

@Injectable()
export class TeamService {
  private readonly bcryptRounds: number;
  private readonly frontendUrl: string;

  constructor(
    private readonly repository: TeamRepository,
    private readonly config: ConfigService,
  ) {
    this.bcryptRounds = this.config.getOrThrow<number>('auth.bcryptRounds');
    this.frontendUrl = this.config
      .getOrThrow<string>('mail.frontendUrl')
      .replace(/\/$/, '');
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid team member id');
    }
  }

  /**
   * Resolves the acting platform admin's own place in the team hierarchy.
   * A platform admin (isPlatformAdmin=true on their `users` account) who
   * hasn't been invited through this module yet — e.g. the very first,
   * bootstrapped account — is treated as SUPER_ADMIN so someone can always
   * seed the team.
   */
  private async resolveActorRole(actor: RequestUser): Promise<TeamRole> {
    const actorRecord = await this.repository.findByEmail(actor.email);
    return actorRecord?.role ?? TeamRole.SUPER_ADMIN;
  }

  private assertCanManage(
    actorRole: TeamRole,
    target: { email: string; role: TeamRole },
    actor: RequestUser,
  ) {
    if (target.email === actor.email.toLowerCase()) {
      throw new ForbiddenException(
        'Use your account settings to manage your own team profile',
      );
    }
    if (actorRole === TeamRole.SUB_ADMIN) {
      throw new ForbiddenException('Sub-admins cannot manage team members');
    }
    if (actorRole === TeamRole.ADMIN && target.role !== TeamRole.SUB_ADMIN) {
      throw new ForbiddenException(
        'Admins can only manage sub-admin team members',
      );
    }
  }

  private async assertNotLastSuperAdmin(excludeId: string) {
    const remaining = await this.repository.countByRole(
      TeamRole.SUPER_ADMIN,
      excludeId,
    );
    if (remaining === 0) {
      throw new BadRequestException(
        'At least one active super admin must remain',
      );
    }
  }

  async invite(actor: RequestUser, dto: CreateTeamMemberDto) {
    const actorRole = await this.resolveActorRole(actor);
    const requestedRole = dto.role ?? TeamRole.SUB_ADMIN;

    if (!GRANTABLE_ROLES[actorRole].includes(requestedRole)) {
      throw new ForbiddenException(
        `A ${humanizeRole(actorRole)} cannot invite a ${humanizeRole(requestedRole)}`,
      );
    }

    const existing = await this.repository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(
        'A team member with this email already exists',
      );
    }
    const existingLoginUser = await this.repository.findLoginUserByEmail(
      dto.email,
    );
    if (existingLoginUser) {
      throw new ConflictException(
        'This email is already registered to an application account and cannot be used for a team invite',
      );
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, this.bcryptRounds);

    const member = await this.repository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: requestedRole,
      permissions: dto.permissions,
      createdBy: actor.id,
    });

    // Mirror a login account so the member can actually sign in through the
    // existing /auth/login flow with the same temp password we email them.
    try {
      const organizationId =
        await this.repository.getOrCreatePlatformOrganizationId();
      const { firstName, lastName } = splitName(dto.name);
      await this.repository.createLoginUser({
        organizationId,
        email: member.email,
        firstName,
        lastName,
        passwordHash,
        role: toUserRole(requestedRole),
      });
    } catch (error) {
      // Keep the two collections consistent — don't leave a team member
      // that can never log in.
      await this.repository.deleteById(String(member._id));
      throw error;
    }

    const template = getTeamInviteTemplate({
      name: member.name,
      email: member.email,
      tempPassword,
      loginUrl: `${this.frontendUrl}/login`,
    });
    const emailSent = await sendEmail(this.config, {
      to: member.email,
      ...template,
    });

    return {
      _id: member._id,
      name: member.name,
      email: member.email,
      role: member.role,
      permissions: member.permissions,
      status: member.status,
      createdBy: member.createdBy,
      createdAt: member.get('createdAt'),
      invitationEmailSent: emailSent,
    };
  }

  list(query: ListTeamMembersQueryDto) {
    return this.repository.list(query.page, query.limit, {
      search: query.search,
      status: query.status,
      role: query.role,
    });
  }

  async getById(id: string) {
    this.assertObjectId(id);
    const member = await this.repository.findById(id);
    if (!member) throw new NotFoundException('Team member not found');
    return member;
  }

  async update(actor: RequestUser, id: string, dto: UpdateTeamMemberDto) {
    const member = await this.getById(id);
    const actorRole = await this.resolveActorRole(actor);

    this.assertCanManage(actorRole, member, actor);

    if (dto.role && dto.role !== member.role) {
      if (!GRANTABLE_ROLES[actorRole].includes(dto.role)) {
        throw new ForbiddenException(
          `A ${humanizeRole(actorRole)} cannot assign the ${humanizeRole(dto.role)} role`,
        );
      }
      if (member.role === TeamRole.SUPER_ADMIN && dto.role !== TeamRole.SUPER_ADMIN) {
        await this.assertNotLastSuperAdmin(id);
      }
    }

    if (
      dto.status === TeamMemberStatus.SUSPENDED &&
      member.role === TeamRole.SUPER_ADMIN
    ) {
      await this.assertNotLastSuperAdmin(id);
    }

    const update: Record<string, unknown> = {};
    if (dto.permissions) update.permissions = dto.permissions;
    if (dto.status) update.status = dto.status;
    if (dto.role) update.role = dto.role;

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No changes were provided');
    }

    const updated = await this.repository.updateById(id, update);
    if (!updated) throw new NotFoundException('Team member not found');

    const loginUpdate: Record<string, unknown> = {};
    if (dto.role) loginUpdate.role = toUserRole(dto.role);
    if (dto.status) {
      loginUpdate.status =
        dto.status === TeamMemberStatus.SUSPENDED
          ? UserStatus.SUSPENDED
          : UserStatus.ACTIVE;
    }
    if (Object.keys(loginUpdate).length > 0) {
      await this.repository.updateLoginUserByEmail(member.email, loginUpdate);
    }

    return updated;
  }

  async resendInvite(actor: RequestUser, id: string) {
    const member = await this.getById(id);
    const actorRole = await this.resolveActorRole(actor);
    this.assertCanManage(actorRole, member, actor);

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, this.bcryptRounds);
    await this.repository.updatePasswordHash(id, passwordHash);
    await this.repository.updateLoginUserByEmail(member.email, {
      passwordHash,
    });

    const template = getTeamInviteTemplate({
      name: member.name,
      email: member.email,
      tempPassword,
      loginUrl: `${this.frontendUrl}/login`,
    });
    const emailSent = await sendEmail(this.config, {
      to: member.email,
      ...template,
    });

    return { _id: id, invitationEmailSent: emailSent };
  }

  async remove(actor: RequestUser, id: string) {
    const member = await this.getById(id);
    const actorRole = await this.resolveActorRole(actor);

    this.assertCanManage(actorRole, member, actor);

    if (member.role === TeamRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(id);
    }

    await this.repository.deleteById(id);
    await this.repository.deleteLoginUserByEmail(member.email);
    return { _id: id, deleted: true };
  }
}