import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { PackageInquiriesService } from '../package-inquiries/package-inquiries.service';
import { ContactUserSalesQueryDto } from '../package-inquiries/dto/contact-user-sales-query.dto';
import { ListSalesQueriesDto } from '../package-inquiries/dto/list-sales-queries.dto';
import { ResolveSalesQueryDto } from '../package-inquiries/dto/resolve-sales-query.dto';
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
    private readonly packageInquiriesService: PackageInquiriesService,
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

  // Sales queries & lead queue — handles Contact Sales, Downgrade inquiries,
  // Specialist call requests, and public launch inquiries.
  @Get('sales-queries')
  @ApiOperation({ summary: 'List sales queries submitted by users or visitors' })
  listSalesQueries(@Query() query: ListSalesQueriesDto) {
    return this.packageInquiriesService.list(query);
  }

  @Get('sales-queries/:id')
  @ApiOperation({ summary: 'Get details of a specific sales query' })
  getSalesQuery(@Param('id') id: string) {
    return this.packageInquiriesService.findById(id);
  }

  @Post('sales-queries/:id/resolve')
  @ApiOperation({ summary: 'Update status and resolution note for a sales query' })
  resolveSalesQuery(
    @Param('id') id: string,
    @Body() dto: ResolveSalesQueryDto,
    @CurrentUser() admin: RequestUser,
  ) {
    return this.packageInquiriesService.resolve(id, dto, admin.id);
  }

  @Post('sales-queries/:id/contact-user')
  @ApiOperation({ summary: 'Send an email directly to the user regarding their sales query' })
  contactUser(
    @Param('id') id: string,
    @Body() dto: ContactUserSalesQueryDto,
    @CurrentUser() admin: RequestUser,
  ) {
    return this.packageInquiriesService.contactUser(id, dto, admin.id);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getForAdmin(id);
  }
}
