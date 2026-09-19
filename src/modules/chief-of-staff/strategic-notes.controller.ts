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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CreateStrategicNoteDto } from './dto/create-strategic-note.dto';
import { ListStrategicNotesQueryDto } from './dto/list-strategic-notes-query.dto';
import { UpdateStrategicNoteDto } from './dto/update-strategic-note.dto';
import { StrategicNotesService } from './strategic-notes.service';

@ApiTags('Chief of Staff')
@ApiBearerAuth()
@Controller('chief-of-staff/strategic-notes')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class StrategicNotesController {
  constructor(private readonly notes: StrategicNotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a CEO strategic note' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateStrategicNoteDto,
  ) {
    return this.notes.create(organization.id, user.id, input);
  }

  @Get()
  @ApiOperation({ summary: 'List CEO strategic notes' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListStrategicNotesQueryDto,
  ) {
    return this.notes.list(organization.id, query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a CEO strategic note' })
  update(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: UpdateStrategicNoteDto,
  ) {
    return this.notes.update(organization.id, id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a CEO strategic note' })
  remove(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.notes.remove(organization.id, user.id, id);
  }
}
