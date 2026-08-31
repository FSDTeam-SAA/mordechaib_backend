import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

// NOTE: the TeamMember schema is registered in the global DatabaseModule
// (src/database/mongoose/mongoose.module.ts), same as every other schema
// in this codebase, so it doesn't need MongooseModule.forFeature() here.
@Module({
  controllers: [TeamController],
  providers: [TeamService, TeamRepository],
  exports: [TeamService],
})

export class TeamModule {}
