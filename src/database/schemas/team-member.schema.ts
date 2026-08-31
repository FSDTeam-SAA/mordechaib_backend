import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TeamMemberStatus } from '../../common/enums/team-member-status.enum';
import { TeamPermission } from '../../common/enums/team-permission.enum';
import { TeamRole } from '../../common/enums/team-role.enum';

export type TeamMemberDocument = HydratedDocument<TeamMember>;

/**
 * Platform-team (internal Noltra staff) accounts, invited by a platform
 * admin with a scoped set of module permissions. Separate from the `users`
 * collection, which holds each customer organization's own users.
 */
@Schema({ timestamps: true, collection: 'team_members' })
export class TeamMember {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({
    default: TeamRole.SUB_ADMIN,
    enum: Object.values(TeamRole),
    index: true,
  })
  role!: TeamRole;

  @Prop({
    type: [String],
    enum: Object.values(TeamPermission),
    default: [],
  })
  permissions!: TeamPermission[];

  @Prop({
    default: TeamMemberStatus.ACTIVE,
    enum: Object.values(TeamMemberStatus),
    index: true,
  })
  status!: TeamMemberStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  // True until the member signs in with their temporary password and sets
  // their own — surface this in the frontend to force a password-change flow.
  @Prop({ default: true })
  mustResetPassword!: boolean;

  @Prop()
  lastActiveAt?: Date;

  @Prop()
  passwordChangedAt?: Date;
}

export const TeamMemberSchema = SchemaFactory.createForClass(TeamMember);
