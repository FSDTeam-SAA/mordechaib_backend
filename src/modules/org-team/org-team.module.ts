import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../../database/schemas/organization.schema';
import { User, UserSchema } from '../../database/schemas/user.schema';
import { OrgTeamController } from './org-team.controller';
import { OrgTeamRepository } from './org-team.repository';
import { OrgTeamService } from './org-team.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [OrgTeamController],
  providers: [OrgTeamService, OrgTeamRepository],
  exports: [OrgTeamService, OrgTeamRepository],
})
export class OrgTeamModule {}
