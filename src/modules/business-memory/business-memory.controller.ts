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
import { BusinessMemoryService } from './business-memory.service';
import { CreateBusinessMemoryDto } from './dto/create-business-memory.dto';
import { ListBusinessMemoriesQueryDto } from './dto/list-business-memories-query.dto';
import { UpdateBusinessMemoryDto } from './dto/update-business-memory.dto';

/**
 * The owner's view of Laura's long-term memory: review what she learned,
 * correct it, add to it, or remove it. Only ACTIVE memories reach the AI.
 */
@ApiTags('Business Memory')
@ApiBearerAuth()
@Controller('business-memory')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class BusinessMemoryController {
  constructor(private readonly memory: BusinessMemoryService) {}

  @Get()
  @ApiOperation({
    summary:
      'List business memories (status=PENDING_REVIEW for the review queue)',
  })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListBusinessMemoriesQueryDto,
  ) {
    return this.memory.list(organization.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Add a business memory (active immediately)' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateBusinessMemoryDto,
  ) {
    return this.memory.create(organization.id, user.id, input);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Correct a business memory' })
  update(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: UpdateBusinessMemoryDto,
  ) {
    return this.memory.update(organization.id, id, input);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a memory Laura learned; she may use it from now on',
  })
  approve(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.memory.approve(organization.id, user.id, id);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject a memory; the same fact is not proposed again',
  })
  reject(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.memory.reject(organization.id, user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a business memory' })
  archive(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.memory.archive(organization.id, user.id, id);
  }
}
