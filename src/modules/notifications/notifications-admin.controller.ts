import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { PublishProductUpdateDto } from './dto/publish-product-update.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications/admin')
@UseGuards(PlatformAdminGuard)
export class NotificationsAdminController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('product-updates')
  @ApiOperation({ summary: 'Publish a preference-aware product update' })
  publishProductUpdate(
    @Body() dto: PublishProductUpdateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notifications.publishProductUpdate(dto, user.id);
  }
}

