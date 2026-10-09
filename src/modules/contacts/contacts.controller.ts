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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@ApiTags('Customer Contacts')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a customer contact without platform login' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateContactDto,
  ) {
    return this.contacts.create(organization.id, user.id, input);
  }

  @Get()
  @ApiOperation({ summary: 'List organization customer contacts' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListContactsQueryDto,
  ) {
    return this.contacts.list(organization.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer contact' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.contacts.get(organization.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer contact' })
  update(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: UpdateContactDto,
  ) {
    return this.contacts.update(organization.id, user.id, id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a customer contact' })
  archive(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.contacts.archive(organization.id, user.id, id);
  }
}
