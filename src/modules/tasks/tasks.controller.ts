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
import { RequestUser } from '../../common/types/request-context.type';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(OrganizationGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Create a task' })
  create(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(org.id, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List organization tasks' })
  findAll(
    @CurrentOrg() org: { id: string },
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.findAll(org.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task' })
  findOne(@CurrentOrg() org: { id: string }, @Param('id') id: string) {
    return this.tasks.findOne(org.id, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Update a task' })
  update(
    @CurrentOrg() org: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(org.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Delete a task' })
  remove(@CurrentOrg() org: { id: string }, @Param('id') id: string) {
    return this.tasks.remove(org.id, id);
  }
}
