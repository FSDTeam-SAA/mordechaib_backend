import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { ListTeamMembersQueryDto } from './dto/list-team-members-query.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamService } from './team.service';

@ApiTags('Team')
@ApiBearerAuth()
@Controller('team')
@UseGuards(PlatformAdminGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Post()
  invite(@CurrentUser() actor: RequestUser, @Body() dto: CreateTeamMemberDto) {
    return this.team.invite(actor, dto);
  }

  @Get()
  list(@Query() query: ListTeamMembersQueryDto) {
    return this.team.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.team.getById(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.team.update(actor, id, dto);
  }

  @Post(':id/resend-invite')
  resendInvite(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.team.resendInvite(actor, id);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.team.remove(actor, id);
  }
}
