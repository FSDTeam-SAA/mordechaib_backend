import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { AiServiceSecretGuard } from '../../common/guards/ai-service-secret.guard';
import { AiBusinessContextService } from './ai-business-context.service';
import { GetAiInternalCalendarAvailabilityQueryDto } from './dto/get-ai-internal-calendar-availability-query.dto';
import { GetAiInternalCustomerQueryDto } from './dto/get-ai-internal-customer-query.dto';
import { ListAiInternalCalendarEventsQueryDto } from './dto/list-ai-internal-calendar-events-query.dto';
import { ListAiInternalCustomersQueryDto } from './dto/list-ai-internal-customers-query.dto';

@ApiTags('AI Internal')
@Controller('ai-internal/organizations/:organizationId')
@Public()
@UseGuards(AiServiceSecretGuard)
@ApiHeader({ name: 'x-ai-actions-secret', required: true })
export class AiBusinessContextController {
  constructor(private readonly context: AiBusinessContextService) {}

  @Get('customers')
  @RawResponse()
  @ApiOperation({ summary: 'Search bounded customer facts for AI context' })
  listCustomers(
    @Param('organizationId') organizationId: string,
    @Query() query: ListAiInternalCustomersQueryDto,
  ) {
    return this.context.listCustomers(organizationId, query);
  }

  @Get('customers/:customerId')
  @RawResponse()
  @ApiOperation({ summary: 'Get one bounded aggregated customer context' })
  getCustomer(
    @Param('organizationId') organizationId: string,
    @Param('customerId') customerId: string,
    @Query() query: GetAiInternalCustomerQueryDto,
  ) {
    return this.context.getCustomer(organizationId, customerId, query);
  }

  @Get('calendar/events')
  @RawResponse()
  @ApiOperation({ summary: 'List bounded organization calendar events' })
  listCalendarEvents(
    @Param('organizationId') organizationId: string,
    @Query() query: ListAiInternalCalendarEventsQueryDto,
  ) {
    return this.context.listCalendarEvents(organizationId, query);
  }

  @Get('calendar/availability')
  @RawResponse()
  @ApiOperation({
    summary: 'Get deterministic free-slot suggestions and conflicts',
  })
  getCalendarAvailability(
    @Param('organizationId') organizationId: string,
    @Query() query: GetAiInternalCalendarAvailabilityQueryDto,
  ) {
    return this.context.getCalendarAvailability(organizationId, query);
  }
}
