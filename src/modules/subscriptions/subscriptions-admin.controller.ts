import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CancellationsService } from './cancellations.service';
import { ListCancellationRequestsQueryDto } from './dto/list-cancellation-requests-query.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions (admin)')
@ApiBearerAuth()
@Controller('subscriptions-admin')
@UseGuards(PlatformAdminGuard)
export class SubscriptionsAdminController {
  constructor(
    private readonly service: SubscriptionsService,
    private readonly cancellationsService: CancellationsService,
  ) {}

  @Get()
  list(@Query() query: ListSubscriptionsQueryDto) {
    return this.service.listForAdmin(query);
  }

  // The cancellation queue — "when admin will execute it" per your spec.
  // The hourly cron also auto-executes once the 7-day grace period
  // elapses, so this is for oversight and acting early, not the only way
  // a cancellation ever gets processed.
  @Get('cancellation-requests')
  listCancellationRequests(@Query() query: ListCancellationRequestsQueryDto) {
    return this.cancellationsService.listForAdmin(query);
  }

  @Post('cancellation-requests/:id/execute')
  executeCancellation(@Param('id') id: string) {
    return this.cancellationsService.execute(id, 'ADMIN');
  }

  @Post('cancellation-requests/:id/undo')
  undoCancellation(@Param('id') id: string) {
    return this.cancellationsService.undoByAdmin(id);
  }
}