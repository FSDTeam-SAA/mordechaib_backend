import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';
import { Connection } from 'mongoose';
import path from 'path';
import { StripeProvider } from '../stripe/stripe.provider';

type StoredAttachment = {
  storageProvider?: string;
  storageKey?: string;
  storageResourceType?: string;
  storageDeliveryType?: string;
};

type LocalRecording = { localFilePath?: string };

// These are organization-owned records. Global product catalogs, platform
// staff, agent definitions and aggregate revenue snapshots are intentionally
// excluded: deleting one customer must never delete another customer's data.
const ORGANIZATION_COLLECTIONS = [
  'integrations',
  'call_logs',
  'approvals',
  'tasks',
  'usage_records',
  'call_usage_periods',
  'audit_logs',
  'package_inquiries',
  'call_recordings',
  'twilio_settings',
  'twilio_accounts',
  'twilio_phone_numbers',
  'onboarding_setups',
  'organization_subscriptions',
  'invoices',
  'cancellation_requests',
  'meeting_bots',
  'meeting_transcripts',
  'zoom_meetings',
  'zoom_meeting_transcripts',
  'meeting_oauth_states',
  'platform_meetings',
  'managed_calendar_events',
  'conversations',
  'messages',
  'message_attachments',
  'ai_settings',
  'ai_action_proposals',
  'ai_source_analyses',
  'agent_activities',
  'executive_briefings',
  'strategic_notes',
  'notifications',
] as const;

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly stripeProvider: StripeProvider,
    private readonly config: ConfigService,
  ) {}

  async deleteOrganizationWorkspace(input: {
    organizationId: string;
    ownerUserId: string;
  }) {
    const db = this.connection.db;
    if (!db) {
      throw new ServiceUnavailableException(
        'Database connection is unavailable. Your account was not deleted.',
      );
    }
    const [organization, users, subscription, attachments, recordings] =
      await Promise.all([
        db
          .collection('organizations')
          .findOne({ _id: this.objectId(input.organizationId) }),
        db
          .collection('users')
          .find({ organizationId: input.organizationId })
          .project({ _id: 1 })
          .toArray(),
        db
          .collection('organization_subscriptions')
          .findOne({ organizationId: input.organizationId }),
        db
          .collection('message_attachments')
          .find({ organizationId: input.organizationId })
          .project({
            storageProvider: 1,
            storageKey: 1,
            storageResourceType: 1,
            storageDeliveryType: 1,
          })
          .toArray() as Promise<StoredAttachment[]>,
        db
          .collection('call_recordings')
          .find({ organizationId: input.organizationId })
          .project({ localFilePath: 1 })
          .toArray() as Promise<LocalRecording[]>,
      ]);

    // Stop future billing before local data is removed. A failed cancellation
    // leaves the workspace untouched so the user is never deleted while a
    // recurring subscription could continue charging.
    const stripeSubscriptionId = subscription?.stripeSubscriptionId;
    if (typeof stripeSubscriptionId === 'string' && stripeSubscriptionId) {
      try {
        await this.stripeProvider.cancelSubscriptionImmediately(
          stripeSubscriptionId,
        );
      } catch (error) {
        this.logger.error(
          `Account deletion stopped because Stripe cancellation failed for organization ${input.organizationId}: ${this.safeErrorMessage(error)}`,
        );
        throw new BadGatewayException(
          'Could not cancel the active subscription. Your account was not deleted.',
        );
      }
    }

    const userIds = users.map((user) => String(user._id));
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await Promise.all(
          ORGANIZATION_COLLECTIONS.map((collectionName) =>
            db
              .collection(collectionName)
              .deleteMany(
                { organizationId: input.organizationId },
                { session },
              ),
          ),
        );
        await Promise.all([
          userIds.length
            ? db
                .collection('auth_sessions')
                .deleteMany({ userId: { $in: userIds } }, { session })
            : Promise.resolve(),
          userIds.length
            ? db
                .collection('auth_tokens')
                .deleteMany({ userId: { $in: userIds } }, { session })
            : Promise.resolve(),
          userIds.length
            ? db
                .collection('notification_preferences')
                .deleteMany({ userId: { $in: userIds } }, { session })
            : Promise.resolve(),
          db
            .collection('users')
            .deleteMany({ organizationId: input.organizationId }, { session }),
          db
            .collection('organizations')
            .deleteOne(
              { _id: this.objectId(input.organizationId) },
              { session },
            ),
        ]);
      });
    } finally {
      await session.endSession();
    }

    // Cloudinary cleanup runs only after the database transaction commits.
    // Failure is logged for operational follow-up and cannot restore deleted
    // customer records or reactivate billing.
    await Promise.all([
      this.removeCloudinaryAssets({
        organizationId: input.organizationId,
        userIds,
        attachments,
        hasOrganizationLogo: Boolean(organization?.logoUrl),
        hasOrganizationFavicon: Boolean(organization?.faviconUrl),
      }),
      this.removeLocalRecordingFiles(recordings),
    ]);

    return { deleted: true };
  }

  private async removeCloudinaryAssets(input: {
    organizationId: string;
    userIds: string[];
    attachments: StoredAttachment[];
    hasOrganizationLogo: boolean;
    hasOrganizationFavicon: boolean;
  }) {
    if (!this.hasCloudinaryConfiguration()) return;

    const avatarFolder = this.folder(
      'cloudinary.profileAvatarFolder',
      'noltra/avatars',
    );
    const logoFolder = this.folder(
      'cloudinary.organizationLogoFolder',
      'noltra/organization-logos',
    );
    const faviconFolder = this.folder(
      'cloudinary.organizationFaviconFolder',
      'noltra/organization-favicons',
    );
    const operations: Array<Promise<unknown>> = [
      ...input.userIds.map((userId) =>
        cloudinary.uploader.destroy(`${avatarFolder}/${userId}`, {
          resource_type: 'image',
          invalidate: true,
        }),
      ),
      ...(input.hasOrganizationLogo
        ? [
            cloudinary.uploader.destroy(
              `${logoFolder}/${input.organizationId}`,
              {
                resource_type: 'image',
                invalidate: true,
              },
            ),
          ]
        : []),
      ...(input.hasOrganizationFavicon
        ? [
            cloudinary.uploader.destroy(
              `${faviconFolder}/${input.organizationId}-favicon`,
              {
                resource_type: 'image',
                invalidate: true,
              },
            ),
          ]
        : []),
      ...input.attachments
        .filter(
          (attachment) =>
            attachment.storageProvider === 'CLOUDINARY' &&
            Boolean(attachment.storageKey),
        )
        .map((attachment) =>
          cloudinary.uploader.destroy(attachment.storageKey!, {
            resource_type: attachment.storageResourceType || 'raw',
            type: attachment.storageDeliveryType || 'authenticated',
            invalidate: true,
          }),
        ),
    ];

    const results = await Promise.allSettled(operations);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      this.logger.warn(
        `Account deletion completed with ${failures.length} Cloudinary cleanup failure(s) for organization ${input.organizationId}`,
      );
    }
  }

  private async removeLocalRecordingFiles(recordings: LocalRecording[]) {
    const storageRoot = path.resolve(
      this.config.get<string>(
        'RECORDING_STORAGE_DIR',
        './storage/recordings',
      ) || './storage/recordings',
    );
    const filePaths = recordings
      .map((recording) => recording.localFilePath)
      .filter((filePath): filePath is string => Boolean(filePath));
    const results = await Promise.allSettled(
      filePaths.map(async (filePath) => {
        const target = path.resolve(filePath);
        const relative = path.relative(storageRoot, target);
        if (
          !relative ||
          relative.startsWith('..') ||
          path.isAbsolute(relative)
        ) {
          throw new Error(
            'Recording path is outside the configured storage directory',
          );
        }
        await fs.unlink(target).catch((error: unknown) => {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
          ) {
            return;
          }
          throw error;
        });
      }),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      this.logger.warn(
        `Account deletion completed with ${failures.length} local recording cleanup failure(s)`,
      );
    }
  }

  private objectId(id: string) {
    return new this.connection.base.Types.ObjectId(id);
  }

  private hasCloudinaryConfiguration() {
    return Boolean(
      this.config.get<string>('cloudinary.cloudName') &&
      this.config.get<string>('cloudinary.apiKey') &&
      this.config.get<string>('cloudinary.apiSecret'),
    );
  }

  private folder(configKey: string, fallback: string) {
    return (this.config.get<string>(configKey, fallback) || fallback).replace(
      /^\/+|\/+$/g,
      '',
    );
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 300)
      : 'Unknown error';
  }
}
