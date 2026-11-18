import {
  Controller,
  Get,
  Param,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { InvoicesService } from './invoices.service';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions/me/invoices')
@UseGuards(OrganizationGuard)
export class UserInvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: "List the current organization's invoice history" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listForOrganization(
      organization.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );
  }

  @Get(':id/download')
  @Redirect()
  @ApiOperation({ summary: 'Redirect to the Stripe-hosted PDF for an invoice' })
  download(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.service.getDownloadRedirectForOrganization(
      organization.id,
      id,
    );
  }
}
