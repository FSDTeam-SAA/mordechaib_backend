import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import { ContactCrmLinksService } from './contact-crm-links.service';
import { ContactWorkspaceRepository } from './contact-workspace.repository';
import { ContactWorkspaceService } from './contact-workspace.service';
import { ContactsService } from './contacts.service';
import { ContactCommercialSummaryService } from './contact-commercial-summary.service';
import { ContactWorkspaceActionsService } from './contact-workspace-actions.service';
import { UserRole } from '../../common/enums/user-role.enum';

describe('ContactWorkspaceService', () => {
  const contactId = '66cc9bdfa847ea856c7b41d2';
  const asOf = new Date('2026-11-12T06:00:00.000Z');
  let contacts: Record<string, jest.Mock>;
  let crmLinks: Record<string, jest.Mock>;
  let repository: Record<string, jest.Mock>;
  let service: ContactWorkspaceService;

  beforeEach(() => {
    contacts = {
      get: jest.fn().mockResolvedValue({
        id: contactId,
        name: 'Mike Johnson',
        email: 'mike@example.com',
        phone: '+15559876543',
        status: CustomerContactStatus.ACTIVE,
      }),
    };
    crmLinks = {
      list: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: 'link-1',
            crmRecordId: 'record-1',
            provider: 'HUBSPOT',
            objectType: 'contacts',
            externalId: 'external-1',
            createdAt: asOf,
            record: {
              id: 'record-1',
              archived: false,
              providerUpdatedAt: asOf,
              syncedAt: asOf,
              properties: { hs_deal_stage_probability: '0.75' },
            },
          },
        ],
      }),
    };
    repository = {
      openTasks: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            _id: 'task-1',
            title: 'Follow up',
            status: 'TODO',
            dueDate: '2026-11-11T06:00:00.000Z',
          },
        ],
      }),
      upcomingMeetings: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ _id: 'meeting-1', title: 'Review', status: 'SCHEDULED' }],
      }),
      recentCalls: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ _id: 'call-1', direction: 'OUTBOUND', status: 'COMPLETED' }],
      }),
      latestHealth: jest.fn().mockResolvedValue({
        _id: 'health-1',
        healthScore: 92,
        riskLevel: 'LOW',
        capturedAt: asOf,
      }),
      recentNotes: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ _id: 'note-1', content: 'Customer prefers email' }],
      }),
      recentFiles: jest.fn().mockResolvedValue({
        total: 1,
        items: [{ _id: 'file-1', originalName: 'quote.pdf' }],
      }),
      linkedDeals: jest.fn().mockResolvedValue([]),
    };
    service = new ContactWorkspaceService(
      contacts as unknown as ContactsService,
      crmLinks as unknown as ContactCrmLinksService,
      repository as unknown as ContactWorkspaceRepository,
      new ContactCommercialSummaryService(),
      new ContactWorkspaceActionsService(),
    );
  });

  it('returns a bounded aggregated customer workspace', async () => {
    const result = await service.get(
      'org-1',
      contactId,
      {
        taskLimit: 4,
        meetingLimit: 3,
        callLimit: 2,
        noteLimit: 3,
        fileLimit: 5,
      },
      UserRole.OWNER,
      asOf,
    );

    expect(repository.openTasks).toHaveBeenCalledWith('org-1', contactId, 4);
    expect(repository.upcomingMeetings).toHaveBeenCalledWith(
      'org-1',
      contactId,
      3,
      asOf,
    );
    expect(repository.recentCalls).toHaveBeenCalledWith('org-1', contactId, 2);
    expect(repository.recentNotes).toHaveBeenCalledWith('org-1', contactId, 3);
    expect(repository.recentFiles).toHaveBeenCalledWith('org-1', contactId, 5);
    expect(repository.linkedDeals).toHaveBeenCalledWith('org-1', []);
    expect(result.capabilities).toEqual({
      call: { available: true, reason: null },
      email: { available: true, reason: null },
      scheduleMeeting: { available: true, reason: null },
      createTask: { available: true, reason: null },
    });
    expect(result.actionContract).toEqual(
      expect.objectContaining({
        version: '1.0',
        actions: expect.objectContaining({
          call: expect.objectContaining({
            enabled: true,
            path: '/api/v1/calls/outbound',
            prefill: { contactId },
          }),
          email: expect.objectContaining({
            path: '/api/v1/email/drafts',
            prefill: {
              to: ['mike@example.com'],
              contactIds: [contactId],
            },
          }),
          scheduleMeeting: expect.objectContaining({
            path: '/api/v1/meetings',
          }),
          createTask: expect.objectContaining({ path: '/api/v1/tasks' }),
        }),
      }),
    );
    expect(result.crm).toEqual(
      expect.objectContaining({
        availability: 'AVAILABLE',
        total: 1,
        providers: ['HUBSPOT'],
        objectTypes: [{ objectType: 'contacts', count: 1 }],
      }),
    );
    expect(result.tasks.items[0]).toEqual(
      expect.objectContaining({ id: 'task-1', isOverdue: true }),
    );
    expect(result.health).toEqual(
      expect.objectContaining({ availability: 'AVAILABLE' }),
    );
    expect(result.notes.items[0]).toEqual(
      expect.objectContaining({ id: 'note-1' }),
    );
    expect(result.files.items[0]).toEqual(
      expect.objectContaining({ id: 'file-1' }),
    );
  });

  it('disables actions for an archived customer without hiding read data', async () => {
    contacts.get.mockResolvedValue({
      id: contactId,
      name: 'Archived customer',
      status: CustomerContactStatus.ARCHIVED,
    });
    repository.latestHealth.mockResolvedValue(null);

    const result = await service.get(
      'org-1',
      contactId,
      {
        taskLimit: 5,
        meetingLimit: 5,
        callLimit: 5,
        noteLimit: 3,
        fileLimit: 5,
      },
      UserRole.OWNER,
      asOf,
    );

    expect(result.capabilities.call).toEqual({
      available: false,
      reason: 'CONTACT_ARCHIVED',
    });
    expect(result.capabilities.createTask).toEqual({
      available: false,
      reason: 'CONTACT_ARCHIVED',
    });
    expect(result.actionContract.actions.call).toEqual(
      expect.objectContaining({
        enabled: false,
        disabledReason: 'CONTACT_ARCHIVED',
      }),
    );
    expect(result.actionContract.actions.createTask).toEqual(
      expect.objectContaining({
        enabled: false,
        disabledReason: 'CONTACT_ARCHIVED',
      }),
    );
    expect(result.health).toEqual({
      availability: 'UNAVAILABLE',
      latest: null,
    });
  });

  it('reports missing action prerequisites explicitly', async () => {
    contacts.get.mockResolvedValue({
      id: contactId,
      name: 'Email-only customer',
      email: 'customer@example.com',
      status: CustomerContactStatus.ACTIVE,
    });

    const result = await service.get(
      'org-1',
      contactId,
      {
        taskLimit: 5,
        meetingLimit: 5,
        callLimit: 5,
        noteLimit: 3,
        fileLimit: 5,
      },
      UserRole.OWNER,
      asOf,
    );

    expect(result.capabilities.call).toEqual({
      available: false,
      reason: 'PHONE_MISSING',
    });
    expect(result.capabilities.email.available).toBe(true);
  });

  it('aligns action capabilities with the existing endpoint roles', async () => {
    const result = await service.get(
      'org-1',
      contactId,
      {
        taskLimit: 5,
        meetingLimit: 5,
        callLimit: 5,
        noteLimit: 3,
        fileLimit: 5,
      },
      UserRole.ADMIN,
      asOf,
    );

    expect(result.capabilities.call.available).toBe(true);
    expect(result.capabilities.scheduleMeeting.available).toBe(true);
    expect(result.capabilities.createTask.available).toBe(true);
    expect(result.capabilities.email).toEqual({
      available: false,
      reason: 'ROLE_NOT_ALLOWED',
    });
    expect(result.actionContract.actions.email).toEqual(
      expect.objectContaining({
        enabled: false,
        disabledReason: 'ROLE_NOT_ALLOWED',
      }),
    );
  });
});
