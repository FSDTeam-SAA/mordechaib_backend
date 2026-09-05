import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(OrganizationGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('notifications')
  getNotifications(@CurrentUser() user: RequestUser) {
    return this.service.getNotifications(user.id);
  }

  @Patch('notifications')
  updateNotifications(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.service.updateNotifications(organization.id, user.id, dto);
  }

  @Get('ai')
  getAiSettings(@CurrentOrg() organization: RequestOrganization) {
    return this.service.getAiSettings(organization.id);
  }

  @Patch('ai')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateAiSettings(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    return this.service.updateAiSettings(organization.id, user.id, dto);
  }
}
