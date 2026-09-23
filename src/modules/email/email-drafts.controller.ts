import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
import { CreateEmailDraftDto } from './dto/create-email-draft.dto';
import { ListEmailDraftsDto } from './dto/list-email-drafts.dto';
import { SendEmailDraftDto } from './dto/send-email-draft.dto';
import { UpdateEmailDraftDto } from './dto/update-email-draft.dto';
import { EmailDraftsService } from './email-drafts.service';

@ApiTags('Email Drafts')
@ApiBearerAuth()
@Controller('email/drafts')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class EmailDraftsController {
  constructor(private readonly drafts: EmailDraftsService) {}

  @Post()
  @ApiOperation({ summary: 'Save an owner email draft in the platform' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateEmailDraftDto,
  ) {
    return this.drafts.create(organization.id, user.id, input);
  }

  @Get()
  @ApiOperation({ summary: 'List the owner’s platform email drafts' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Query() query: ListEmailDraftsDto,
  ) {
    return this.drafts.list(organization.id, user.id, query);
  }

  @Get(':id')
  get(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.drafts.get(organization.id, user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: UpdateEmailDraftDto,
  ) {
    return this.drafts.update(organization.id, user.id, id, input);
  }

  @Post(':id/send')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send the reviewed draft from the owner’s connected account',
  })
  send(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: SendEmailDraftDto,
  ) {
    return this.drafts.send(
      organization.id,
      user.id,
      id,
      input.revision,
      input.provider,
    );
  }
}
