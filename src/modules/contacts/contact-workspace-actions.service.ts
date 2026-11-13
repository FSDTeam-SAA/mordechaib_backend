import { Injectable } from '@nestjs/common';

type WorkspaceCapability = {
  available: boolean;
  reason: string | null;
};

type ContactActionKey = 'call' | 'email' | 'scheduleMeeting' | 'createTask';

type ContactActionDefinition = {
  method: 'POST';
  path: string;
  requiredFields: string[];
  prefill: Record<string, unknown>;
};

@Injectable()
export class ContactWorkspaceActionsService {
  build(input: {
    contactId: string;
    email?: string | null;
    capabilities: Record<ContactActionKey, WorkspaceCapability>;
  }) {
    const definitions: Record<ContactActionKey, ContactActionDefinition> = {
      call: {
        method: 'POST',
        path: '/api/v1/calls/outbound',
        requiredFields: [],
        prefill: { contactId: input.contactId },
      },
      email: {
        method: 'POST',
        path: '/api/v1/email/drafts',
        requiredFields: ['subject', 'body'],
        prefill: {
          to: input.email ? [input.email] : [],
          contactIds: [input.contactId],
        },
      },
      scheduleMeeting: {
        method: 'POST',
        path: '/api/v1/meetings',
        requiredFields: ['platform', 'title'],
        prefill: { contactIds: [input.contactId] },
      },
      createTask: {
        method: 'POST',
        path: '/api/v1/tasks',
        requiredFields: ['title'],
        prefill: { contactIds: [input.contactId] },
      },
    };

    return {
      version: '1.0',
      actions: Object.fromEntries(
        (Object.keys(definitions) as ContactActionKey[]).map((key) => [
          key,
          {
            enabled: input.capabilities[key].available,
            disabledReason: input.capabilities[key].reason,
            ...definitions[key],
          },
        ]),
      ),
    };
  }
}
