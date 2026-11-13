import { Injectable } from '@nestjs/common';
import { CalendarDashboardService } from '../calendar/calendar-dashboard.service';
import { CalendarService } from '../calendar/calendar.service';
import { ContactWorkspaceService } from '../contacts/contact-workspace.service';
import { ContactsService } from '../contacts/contacts.service';
import { AiSourceContextService } from './ai-source-context.service';
import { GetAiInternalCalendarAvailabilityQueryDto } from './dto/get-ai-internal-calendar-availability-query.dto';
import { GetAiInternalCustomerQueryDto } from './dto/get-ai-internal-customer-query.dto';
import { ListAiInternalCalendarEventsQueryDto } from './dto/list-ai-internal-calendar-events-query.dto';
import { ListAiInternalCustomersQueryDto } from './dto/list-ai-internal-customers-query.dto';

@Injectable()
export class AiBusinessContextService {
  constructor(
    private readonly sourceContext: AiSourceContextService,
    private readonly contacts: ContactsService,
    private readonly customerWorkspace: ContactWorkspaceService,
    private readonly calendar: CalendarService,
    private readonly calendarDashboard: CalendarDashboardService,
  ) {}

  async listCustomers(
    organizationId: string,
    query: ListAiInternalCustomersQueryDto,
  ) {
    const requester = await this.authorize(
      organizationId,
      query.requesterUserId,
    );
    const { requesterUserId: _requesterUserId, ...filters } = query;
    void _requesterUserId;
    const result = await this.contacts.list(organizationId, filters);
    return {
      organizationId,
      requester: this.requesterScope(requester),
      ...result,
    };
  }

  async getCustomer(
    organizationId: string,
    customerId: string,
    query: GetAiInternalCustomerQueryDto,
  ) {
    const requester = await this.authorize(
      organizationId,
      query.requesterUserId,
    );
    const { requesterUserId: _requesterUserId, ...limits } = query;
    void _requesterUserId;
    const workspace = await this.customerWorkspace.get(
      organizationId,
      customerId,
      limits,
      requester.role,
    );
    const {
      capabilities: _capabilities,
      actionContract: _actionContract,
      ...facts
    } = workspace;
    void _capabilities;
    void _actionContract;
    return {
      organizationId,
      requester: this.requesterScope(requester),
      customer: facts,
    };
  }

  async listCalendarEvents(
    organizationId: string,
    query: ListAiInternalCalendarEventsQueryDto,
  ) {
    const requester = await this.authorize(
      organizationId,
      query.requesterUserId,
    );
    const { requesterUserId: _requesterUserId, ...filters } = query;
    void _requesterUserId;
    const result = await this.calendar.listEvents(organizationId, filters);
    return {
      organizationId,
      requester: this.requesterScope(requester),
      ...result,
    };
  }

  async getCalendarAvailability(
    organizationId: string,
    query: GetAiInternalCalendarAvailabilityQueryDto,
  ) {
    const requester = await this.authorize(
      organizationId,
      query.requesterUserId,
    );
    const { requesterUserId: _requesterUserId, ...range } = query;
    void _requesterUserId;
    const dashboard = await this.calendarDashboard.get(organizationId, range);
    return {
      organizationId,
      requester: this.requesterScope(requester),
      asOf: dashboard.asOf,
      timezone: dashboard.timezone,
      range: dashboard.range,
      dataAvailability: dashboard.dataAvailability,
      calendarProvider: dashboard.calendarProvider,
      busyEventCount: dashboard.summary.scheduled,
      conflicts: dashboard.conflicts,
      availability: dashboard.aiScheduling,
    };
  }

  private authorize(organizationId: string, requesterUserId: string) {
    return this.sourceContext.requireActiveRequester(
      organizationId,
      requesterUserId,
    );
  }

  private requesterScope(requester: {
    userId: string;
    name: string;
    role: string;
  }) {
    return {
      userId: requester.userId,
      name: requester.name,
      role: requester.role,
    };
  }
}
