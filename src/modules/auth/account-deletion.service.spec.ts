import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { StripeProvider } from '../stripe/stripe.provider';
import { AccountDeletionService } from './account-deletion.service';

describe('AccountDeletionService', () => {
  const organizationId = '507f1f77bcf86cd799439012';
  let deleteMany: jest.Mock;
  let deleteOne: jest.Mock;
  let collection: jest.Mock;
  let stripeProvider: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let organization: Record<string, jest.Mock>;
  let service: AccountDeletionService;

  beforeEach(() => {
    deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
    deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
    users = {
      find: jest.fn().mockReturnValue({
        project: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ _id: 'user-1' }]),
        }),
      }),
      deleteMany,
    };
    const attachments = {
      find: jest.fn().mockReturnValue({
        project: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
      deleteMany,
    };
    organization = {
      findOne: jest.fn().mockResolvedValue({}),
      deleteOne,
    };
    const subscription = {
      findOne: jest.fn().mockResolvedValue({
        stripeSubscriptionId: 'sub_123',
      }),
      deleteMany,
    };
    const recordings = {
      find: jest.fn().mockReturnValue({
        project: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
      deleteMany,
    };
    const generic = { deleteMany };
    collection = jest.fn((name: string) => {
      if (name === 'users') return users;
      if (name === 'message_attachments') return attachments;
      if (name === 'organizations') return organization;
      if (name === 'organization_subscriptions') return subscription;
      if (name === 'call_recordings') return recordings;
      return generic;
    });
    const session = {
      withTransaction: jest.fn((callback: () => Promise<void>) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    stripeProvider = { cancelSubscriptionImmediately: jest.fn() };
    service = new AccountDeletionService(
      {
        db: { collection },
        base: { Types },
        startSession: jest.fn().mockResolvedValue(session),
      } as never,
      stripeProvider as unknown as StripeProvider,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('cancels billing then removes organization-scoped records, credentials and organization', async () => {
    await expect(
      service.deleteOrganizationWorkspace({
        organizationId,
        ownerUserId: 'user-1',
      }),
    ).resolves.toEqual({ deleted: true });

    expect(stripeProvider.cancelSubscriptionImmediately).toHaveBeenCalledWith(
      'sub_123',
    );
    expect(collection).toHaveBeenCalledWith('ai_action_proposals');
    expect(collection).toHaveBeenCalledWith('auth_sessions');
    expect(collection).toHaveBeenCalledWith('auth_tokens');
    expect(collection).toHaveBeenCalledWith('notification_preferences');
    expect(users.deleteMany).toHaveBeenCalledWith(
      { organizationId },
      expect.any(Object),
    );
    expect(organization.deleteOne).toHaveBeenCalledWith(
      { _id: expect.any(Types.ObjectId) },
      expect.any(Object),
    );
  });
});
