import { ContactWorkspaceActionsService } from './contact-workspace-actions.service';

describe('ContactWorkspaceActionsService', () => {
  const service = new ContactWorkspaceActionsService();

  it('maps customer actions to existing authoritative endpoints', () => {
    const result = service.build({
      contactId: '66cc9bdfa847ea856c7b41d2',
      email: 'customer@example.com',
      capabilities: {
        call: { available: true, reason: null },
        email: { available: true, reason: null },
        scheduleMeeting: { available: true, reason: null },
        createTask: { available: true, reason: null },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        version: '1.0',
        actions: expect.objectContaining({
          call: expect.objectContaining({
            path: '/api/v1/calls/outbound',
            prefill: { contactId: '66cc9bdfa847ea856c7b41d2' },
          }),
          email: expect.objectContaining({
            path: '/api/v1/email/drafts',
            requiredFields: ['subject', 'body'],
            prefill: {
              to: ['customer@example.com'],
              contactIds: ['66cc9bdfa847ea856c7b41d2'],
            },
          }),
          scheduleMeeting: expect.objectContaining({
            path: '/api/v1/meetings',
          }),
          createTask: expect.objectContaining({ path: '/api/v1/tasks' }),
        }),
      }),
    );
  });

  it('preserves disabled reasons and never invents a missing email', () => {
    const result = service.build({
      contactId: '66cc9bdfa847ea856c7b41d2',
      capabilities: {
        call: { available: false, reason: 'PHONE_MISSING' },
        email: { available: false, reason: 'EMAIL_MISSING' },
        scheduleMeeting: { available: false, reason: 'EMAIL_MISSING' },
        createTask: { available: true, reason: null },
      },
    });

    expect(result.actions.email).toEqual(
      expect.objectContaining({
        enabled: false,
        disabledReason: 'EMAIL_MISSING',
        prefill: {
          to: [],
          contactIds: ['66cc9bdfa847ea856c7b41d2'],
        },
      }),
    );
  });
});
