import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('Invoices (admin)')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(PlatformAdminGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  list(@Query() query: ListInvoicesQueryDto) {
    return this.service.listForAdmin(query);
  }

  @Post('sync/subscription/:subscriptionId')
  syncForSubscription(@Param('subscriptionId') subscriptionId: string) {
    return this.service.syncForSubscription(subscriptionId);
  }

  // "Download" in the UI should just link straight to invoicePdfUrl from
  // the list response (that's Stripe's own hosted file) — no server-side
  // proxy endpoint needed for that.
  @Get(':id/download')
  @Redirect()
  download(@Param('id') id: string) {
    return this.service.getDownloadRedirect(id);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
