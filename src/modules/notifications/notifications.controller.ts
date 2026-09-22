import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(OrganizationGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user notifications' })
  list(
    @CurrentOrg() organization: { id: string },
    @CurrentUser() user: RequestUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(organization.id, user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the current user unread notification count' })
  unreadCount(
    @CurrentOrg() organization: { id: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.notifications.unreadCount(organization.id, user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  markAllRead(
    @CurrentOrg() organization: { id: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.notifications.markAllRead(organization.id, user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one current user notification as read' })
  markRead(
    @CurrentOrg() organization: { id: string },
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(organization.id, user.id, id);
  }

  @Patch(':id/unread')
  @ApiOperation({ summary: 'Mark one current user notification as unread' })
  markUnread(
    @CurrentOrg() organization: { id: string },
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markUnread(organization.id, user.id, id);
  }
}
