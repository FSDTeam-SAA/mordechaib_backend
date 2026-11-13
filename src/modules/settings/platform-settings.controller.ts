import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { PlatformSettingsService } from './platform-settings.service';

@ApiTags('Platform Settings')
@ApiBearerAuth()
@Controller('platform/settings')
@UseGuards(PlatformAdminGuard)
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get global platform information and regional settings',
  })
  get() {
    return this.settings.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update global platform information and regional settings',
    description:
      'Send the revision returned by GET /api/v1/platform/settings as expectedRevision to prevent lost updates.',
  })
  update(
    @CurrentUser() actor: RequestUser,
    @Body() input: UpdatePlatformSettingsDto,
  ) {
    return this.settings.update(actor, input);
  }
}
