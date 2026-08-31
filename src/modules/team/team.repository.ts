import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { TeamMemberStatus } from '../../common/enums/team-member-status.enum';
import { TeamPermission } from '../../common/enums/team-permission.enum';
import { TeamRole } from '../../common/enums/team-role.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { Organization } from '../../database/schemas/organization.schema';
import { TeamMember } from '../../database/schemas/team-member.schema';
import { User } from '../../database/schemas/user.schema';

type CreateTeamMemberInput = {
  name: string;
  email: string;
  passwordHash: string;
  role: TeamRole;
  permissions: TeamPermission[];
  createdBy: string;
};

type ListFilters = {
  search?: string;
  status?: TeamMemberStatus;
  role?: TeamRole;
};

type CreateLoginUserInput = {
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  role: UserRole;
};

// Every invited team member gets a login (`users`) account so the existing
// auth/login/refresh flow works for them unmodified. They aren't part of
// any customer organization, so they're all parked under this one shared,
// auto-created internal organization.
const PLATFORM_ORGANIZATION_NAME = 'Noltra Platform Team';

@Injectable()
export class TeamRepository {
  constructor(
    @InjectModel(TeamMember.name)
    private readonly teamMemberModel: Model<TeamMember>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<Organization>,
  ) {}

  findByEmail(email: string) {
    return this.teamMemberModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findByEmailWithPassword(email: string) {
    return this.teamMemberModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  create(input: CreateTeamMemberInput) {
    return this.teamMemberModel.create(input);
  }

  async list(page: number, limit: number, filters: ListFilters) {
    const filter: FilterQuery<TeamMember> = {};

    if (filters.search) {
      filter.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }
    if (filters.status) filter.status = filters.status;
    if (filters.role) filter.role = filters.role;

    const [items, total] = await Promise.all([
      this.teamMemberModel
        .find(filter)
        .populate('createdBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.teamMemberModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  findById(id: string) {
    return this.teamMemberModel
      .findById(id)
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }

  updateById(id: string, update: Record<string, unknown>) {
    return this.teamMemberModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
  }

  updatePasswordHash(id: string, passwordHash: string) {
    return this.teamMemberModel
      .findByIdAndUpdate(
        id,
        { passwordHash, mustResetPassword: true },
        { new: true },
      )
      .exec();
  }

  touchLastActive(id: string) {
    return this.teamMemberModel
      .findByIdAndUpdate(id, { lastActiveAt: new Date() })
      .exec();
  }

  deleteById(id: string) {
    return this.teamMemberModel.findByIdAndDelete(id).exec();
  }

  countByRole(role: TeamRole, excludeId?: string) {
    return this.teamMemberModel
      .countDocuments({
        role,
        status: TeamMemberStatus.ACTIVE,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .exec();
  }

  // --- login (`users` collection) mirroring -------------------------------

  /**
   * Finds the shared internal organization used to park team-member login
   * accounts, creating it on first use. Reused across every invite, so this
   * only actually inserts once per environment.
   */
  async getOrCreatePlatformOrganizationId(): Promise<string> {
    const existing = await this.organizationModel
      .findOne({ name: PLATFORM_ORGANIZATION_NAME })
      .select('_id')
      .lean()
      .exec();
    if (existing) return String(existing._id);

    const created = await this.organizationModel.create({
      name: PLATFORM_ORGANIZATION_NAME,
      status: 'ACTIVE',
    });
    return String(created._id);
  }

  findLoginUserByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  createLoginUser(input: CreateLoginUserInput) {
    return this.userModel.create({
      organizationId: input.organizationId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: input.passwordHash,
      role: input.role,
      status: UserStatus.ACTIVE,
      isPlatformAdmin: true,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
    });
  }

  updateLoginUserByEmail(email: string, update: Record<string, unknown>) {
    return this.userModel
      .findOneAndUpdate({ email: email.toLowerCase() }, update, { new: true })
      .exec();
  }

  deleteLoginUserByEmail(email: string) {
    return this.userModel
      .findOneAndDelete({ email: email.toLowerCase(), isPlatformAdmin: true })
      .exec();
  }
}