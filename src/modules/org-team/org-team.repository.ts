import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { Organization } from '../../database/schemas/organization.schema';
import { User, UserDocument } from '../../database/schemas/user.schema';

export type CreateOrgMemberInput = {
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  role: UserRole;
  permissions: string[];
  invitedBy: Types.ObjectId;
};

export type ListOrgTeamFilters = {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  organizationId?: string;
};

@Injectable()
export class OrgTeamRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<Organization>,
  ) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findOrgById(organizationId: string) {
    return this.organizationModel.findById(organizationId).lean().exec();
  }

  findUserInOrg(organizationId: string, id: string) {
    return this.userModel
      .findOne({ _id: id, organizationId })
      .populate('invitedBy', 'firstName lastName email')
      .exec();
  }

  findById(id: string) {
    return this.userModel
      .findById(id)
      .populate('invitedBy', 'firstName lastName email')
      .exec();
  }

  createMember(input: CreateOrgMemberInput) {
    return this.userModel.create({
      organizationId: input.organizationId,
      email: input.email.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: input.passwordHash,
      role: input.role,
      permissions: input.permissions,
      status: UserStatus.ACTIVE,
      isPlatformAdmin: false,
      mustResetPassword: true,
      invitedBy: input.invitedBy,
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
    });
  }

  updateById(id: string, update: Record<string, unknown>) {
    return this.userModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('invitedBy', 'firstName lastName email')
      .exec();
  }

  deleteById(id: string) {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async listMembersByOrg(
    organizationId: string,
    page: number,
    limit: number,
    filters: ListOrgTeamFilters,
  ) {
    const filter: FilterQuery<User> = {
      organizationId,
    };

    if (filters.search) {
      const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { firstName: { $regex: escaped, $options: 'i' } },
        { lastName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (filters.role) filter.role = filters.role;
    if (filters.status) filter.status = filters.status;

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .populate('invitedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  async listAllForAdmin(
    page: number,
    limit: number,
    filters: ListOrgTeamFilters,
  ) {
    const filter: FilterQuery<User> = {
      isPlatformAdmin: false, // only customer organization members
    };

    if (filters.organizationId) {
      filter.organizationId = filters.organizationId;
    }

    if (filters.search) {
      const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { firstName: { $regex: escaped, $options: 'i' } },
        { lastName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (filters.role) filter.role = filters.role;
    if (filters.status) filter.status = filters.status;

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .populate('invitedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  countByRole(organizationId: string, role: UserRole, excludeId?: string) {
    return this.userModel
      .countDocuments({
        organizationId,
        role,
        status: UserStatus.ACTIVE,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
      .exec();
  }
}
