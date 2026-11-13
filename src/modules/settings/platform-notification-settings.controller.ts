import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { UpdatePlatformNotificationSettingsDto } from './dto/update-platform-notification-settings.dto';
import { PlatformNotificationSettingsService } from './platform-notification-settings.service';

@ApiTags('Platform Settings')
@ApiBearerAuth()
@Controller('platform/settings/notifications')
@UseGuards(PlatformAdminGuard)
export class PlatformNotificationSettingsController {
  constructor(private readonly settings: PlatformNotificationSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get platform operational notification settings' })
  get() {
    return this.settings.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update platform operational notification settings',
    description:
      'Use the latest revision returned by GET to prevent overwriting another platform administrator update.',
  })
  update(
    @CurrentUser() actor: RequestUser,
    @Body() input: UpdatePlatformNotificationSettingsDto,
  ) {
    return this.settings.update(actor, input);
  }
}
