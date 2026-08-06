import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions (admin)')
@ApiBearerAuth()
@Controller('subscriptions-admin')
@UseGuards(PlatformAdminGuard)
export class SubscriptionsAdminController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  list(@Query() query: ListSubscriptionsQueryDto) {
    return this.service.listForAdmin(query);
  }
}