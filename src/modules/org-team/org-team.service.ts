import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { isValidObjectId, Types } from 'mongoose';
import { OrgPermission, ALL_ORG_PERMISSIONS } from '../../common/enums/org-permission.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { generateTempPassword } from '../../common/helpers/generate-temp-password.helper';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { getOrgMemberInviteTemplate } from '../../common/templates/org-member-invite.template';
import { RequestUser } from '../../common/types/request-context.type';
import { CreateOrgTeamMemberDto } from './dto/create-org-team-member.dto';
import { ListOrgTeamMembersQueryDto } from './dto/list-org-team-members-query.dto';
import { UpdateOrgTeamMemberDto } from './dto/update-org-team-member.dto';
import { OrgTeamRepository } from './org-team.repository';

function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') || firstName };
}

@Injectable()
export class OrgTeamService {
  private readonly bcryptRounds: number;
  private readonly frontendUrl: string;

  constructor(
    private readonly repository: OrgTeamRepository,
    private readonly config: ConfigService,
  ) {
    this.bcryptRounds = this.config.getOrThrow<number>('auth.bcryptRounds');
    this.frontendUrl = this.config
      .getOrThrow<string>('mail.frontendUrl')
      .replace(/\/$/, '');
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid member id');
    }
  }

  private assertCanManage(
    actor: RequestUser,
    target: { _id: unknown; role: UserRole },
  ) {
    if (String(target._id) === actor.id) {
      throw new ForbiddenException(
        'Use account settings to manage your own profile',
      );
    }
    if (actor.role === UserRole.MEMBER || actor.role === UserRole.VIEWER) {
      throw new ForbiddenException(
        'You do not have permission to manage team members',
      );
    }
    if (actor.role === UserRole.ADMIN && target.role === UserRole.OWNER) {
      throw new ForbiddenException(
        'Admins cannot manage organization owners',
      );
    }
    if (actor.role === UserRole.ADMIN && target.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Admins cannot manage other admins',
      );
    }
  }

  getAvailablePermissions() {
    return {
      permissions: Object.values(OrgPermission),
      defaults: ALL_ORG_PERMISSIONS,
    };
  }

  async invite(actor: RequestUser, dto: CreateOrgTeamMemberDto) {
    if (actor.role !== UserRole.OWNER && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only organization owners and admins can invite team members',
      );
    }

    const requestedRole = dto.role ?? UserRole.MEMBER;
    if (requestedRole === UserRole.OWNER) {
      throw new ForbiddenException(
        'Cannot invite someone directly with the OWNER role. Transfer ownership after joining if needed.',
      );
    }

    if (actor.role === UserRole.ADMIN && requestedRole === UserRole.ADMIN) {
      throw new ForbiddenException('Admins cannot invite other admins');
    }

    const existing = await this.repository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(
        'A user with this email already exists in the system',
      );
    }

    const org = await this.repository.findOrgById(actor.organizationId);
    const orgName = org?.name || 'Workspace';

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, this.bcryptRounds);
    const { firstName, lastName } = splitName(dto.name);

    // If permissions array includes ALL_ACCESS or is empty, resolve appropriate list
    let permissions = dto.permissions && dto.permissions.length > 0
      ? dto.permissions
      : [OrgPermission.DASHBOARD];

    if (permissions.includes(OrgPermission.ALL_ACCESS)) {
      permissions = ALL_ORG_PERMISSIONS;
    }

    const member = await this.repository.createMember({
      organizationId: actor.organizationId,
      email: dto.email,
      firstName,
      lastName,
      passwordHash,
      role: requestedRole,
      permissions,
      invitedBy: new Types.ObjectId(actor.id),
    });

    const template = getOrgMemberInviteTemplate({
      name: `${member.firstName} ${member.lastName}`.trim(),
      email: member.email,
      organizationName: orgName,
      inviterName: `${actor.firstName} ${actor.lastName}`.trim(),
      role: requestedRole,
      tempPassword,
      loginUrl: `${this.frontendUrl}/login`,
    });

    const emailSent = await sendEmail(this.config, {
      to: member.email,
      ...template,
    });

    return {
      _id: member._id,
      organizationId: member.organizationId,
      name: `${member.firstName} ${member.lastName}`.trim(),
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      role: member.role,
      permissions: member.permissions,
      status: member.status,
      invitedBy: {
        _id: actor.id,
        firstName: actor.firstName,
        lastName: actor.lastName,
        email: actor.email,
      },
      createdAt: member.createdAt,
      invitationEmailSent: emailSent,
    };
  }

  list(actor: RequestUser, query: ListOrgTeamMembersQueryDto) {
    return this.repository.listMembersByOrg(
      actor.organizationId,
      query.page,
      query.limit,
      {
        search: query.search,
        role: query.role,
        status: query.status,
      },
    );
  }

  async getById(actor: RequestUser, id: string) {
    this.assertObjectId(id);
    const member = await this.repository.findUserInOrg(actor.organizationId, id);
    if (!member) {
      throw new NotFoundException('Team member not found in your organization');
    }
    return member;
  }

  async update(actor: RequestUser, id: string, dto: UpdateOrgTeamMemberDto) {
    this.assertObjectId(id);
    const member = await this.repository.findUserInOrg(actor.organizationId, id);
    if (!member) {
      throw new NotFoundException('Team member not found in your organization');
    }

    this.assertCanManage(actor, member);

    if (dto.role) {
      if (dto.role === UserRole.OWNER && actor.role !== UserRole.OWNER) {
        throw new ForbiddenException('Only owners can transfer or grant the OWNER role');
      }
      if (actor.role === UserRole.ADMIN && dto.role === UserRole.ADMIN) {
        throw new ForbiddenException('Admins cannot promote members to ADMIN');
      }
    }

    const update: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const { firstName, lastName } = splitName(dto.name);
      update.firstName = firstName;
      update.lastName = lastName;
    }

    if (dto.role !== undefined) update.role = dto.role;

    if (dto.permissions !== undefined) {
      let perms = dto.permissions;
      if (perms.includes(OrgPermission.ALL_ACCESS)) {
        perms = ALL_ORG_PERMISSIONS;
      }
      update.permissions = perms;
    }

    if (dto.status !== undefined) {
      if (member.role === UserRole.OWNER && dto.status === UserStatus.SUSPENDED) {
        const remainingOwners = await this.repository.countByRole(
          actor.organizationId,
          UserRole.OWNER,
          id,
        );
        if (remainingOwners === 0) {
          throw new BadRequestException('At least one active owner must remain');
        }
      }
      update.status = dto.status;
    }

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No changes were provided');
    }

    const updated = await this.repository.updateById(id, update);
    if (!updated) {
      throw new NotFoundException('Team member not found');
    }

    return updated;
  }

  async resendInvite(actor: RequestUser, id: string) {
    this.assertObjectId(id);
    const member = await this.repository.findUserInOrg(actor.organizationId, id);
    if (!member) {
      throw new NotFoundException('Team member not found in your organization');
    }

    this.assertCanManage(actor, member);

    const org = await this.repository.findOrgById(actor.organizationId);
    const orgName = org?.name || 'Workspace';

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, this.bcryptRounds);

    await this.repository.updateById(id, {
      passwordHash,
      mustResetPassword: true,
    });

    const template = getOrgMemberInviteTemplate({
      name: `${member.firstName} ${member.lastName}`.trim(),
      email: member.email,
      organizationName: orgName,
      inviterName: `${actor.firstName} ${actor.lastName}`.trim(),
      role: member.role,
      tempPassword,
      loginUrl: `${this.frontendUrl}/login`,
    });

    const emailSent = await sendEmail(this.config, {
      to: member.email,
      ...template,
    });

    return {
      _id: id,
      email: member.email,
      invitationEmailSent: emailSent,
    };
  }

  async remove(actor: RequestUser, id: string) {
    this.assertObjectId(id);
    const member = await this.repository.findUserInOrg(actor.organizationId, id);
    if (!member) {
      throw new NotFoundException('Team member not found in your organization');
    }

    this.assertCanManage(actor, member);

    if (member.role === UserRole.OWNER) {
      throw new ForbiddenException('Organization owners cannot be removed');
    }

    await this.repository.deleteById(id);
    return { _id: id, deleted: true };
  }

  // --- Platform Admin Cross-Organization Helpers ----------------------------

  listByOrgForAdmin(organizationId: string, query: ListOrgTeamMembersQueryDto) {
    this.assertObjectId(organizationId);
    return this.repository.listMembersByOrg(
      organizationId,
      query.page,
      query.limit,
      {
        search: query.search,
        role: query.role,
        status: query.status,
      },
    );
  }

  listAllForAdmin(query: ListOrgTeamMembersQueryDto & { organizationId?: string }) {
    return this.repository.listAllForAdmin(
      query.page,
      query.limit,
      {
        organizationId: query.organizationId,
        search: query.search,
        role: query.role,
        status: query.status,
      },
    );
  }
}
