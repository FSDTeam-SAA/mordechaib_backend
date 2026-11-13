import { UserRole } from '../../common/enums/user-role.enum';
import { AiBusinessContextService } from './ai-business-context.service';

describe('AiBusinessContextService', () => {
  const requester = {
    userId: '507f1f77bcf86cd799439011',
    name: 'Business Owner',
    role: UserRole.OWNER,
    status: 'ACTIVE',
  };
  const sourceContext = {
    requireActiveRequester: jest.fn().mockResolvedValue(requester),
  };
  const contacts = { list: jest.fn() };
  const customerWorkspace = { get: jest.fn() };
  const calendar = { listEvents: jest.fn() };
  const calendarDashboard = { get: jest.fn() };
  const service = new AiBusinessContextService(
    sourceContext as never,
    contacts as never,
    customerWorkspace as never,
    calendar as never,
    calendarDashboard as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('reuses customer search while removing requesterUserId from filters', async () => {
    contacts.list.mockResolvedValue({
      items: [{ id: 'customer-1' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const result = await service.listCustomers('org-1', {
      requesterUserId: requester.userId,
      page: 1,
      limit: 20,
      status: 'ACTIVE' as never,
      search: 'Acme',
    });

    expect(sourceContext.requireActiveRequester).toHaveBeenCalledWith(
      'org-1',
      requester.userId,
    );
    expect(contacts.list).toHaveBeenCalledWith(
      'org-1',
      expect.not.objectContaining({ requesterUserId: expect.anything() }),
    );
    expect(result.requester).toEqual({
      userId: requester.userId,
      name: requester.name,
      role: requester.role,
    });
  });

  it('removes UI execution capabilities from customer facts', async () => {
    customerWorkspace.get.mockResolvedValue({
      contactId: 'customer-1',
      profile: { name: 'Acme Contact' },
      capabilities: { email: { available: true } },
      actionContract: { email: { method: 'POST' } },
    });

    const result = await service.getCustomer('org-1', 'customer-1', {
      requesterUserId: requester.userId,
      taskLimit: 5,
      meetingLimit: 5,
      callLimit: 5,
      noteLimit: 3,
      fileLimit: 5,
    });

    expect(result.customer).toEqual({
      contactId: 'customer-1',
      profile: { name: 'Acme Contact' },
    });
    expect(result.customer).not.toHaveProperty('capabilities');
    expect(result.customer).not.toHaveProperty('actionContract');
  });

  it('returns only scheduling facts from the calendar dashboard', async () => {
    calendarDashboard.get.mockResolvedValue({
      asOf: '2026-11-13T00:00:00.000Z',
      timezone: 'Asia/Dhaka',
      calendarProvider: 'GOOGLE',
      range: { from: 'from', to: 'to' },
      dataAvailability: { availability: 'AVAILABLE' },
      summary: { scheduled: 2 },
      conflicts: { items: [] },
      aiScheduling: { availability: 'AVAILABLE', suggestions: [] },
      items: [{ private: 'not exposed' }],
    });

    const result = await service.getCalendarAvailability('org-1', {
      requesterUserId: requester.userId,
      from: '2026-11-13T00:00:00.000Z',
      to: '2026-11-14T00:00:00.000Z',
      timezone: 'Asia/Dhaka',
      bufferMinutes: 15,
      upcomingLimit: 8,
      conflictLimit: 20,
      suggestionDurationMinutes: 30,
      suggestionLimit: 5,
    });

    expect(result.busyEventCount).toBe(2);
    expect(result).not.toHaveProperty('items');
    expect(result.availability).toEqual({
      availability: 'AVAILABLE',
      suggestions: [],
    });
  });
});
