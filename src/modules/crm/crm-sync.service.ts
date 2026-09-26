import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CrmConnectionMetadata,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmDealsRepository } from './crm-deals.repository';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRepository } from './crm.repository';

const MAX_PAGES_PER_RUN = 20;

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly providers: CrmProviderRegistry,
    private readonly connectionsRepository: CrmRepository,
    private readonly deals: CrmDealsRepository,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
  ) {}

  async sync(
    organizationId: string,
    provider: CrmProviderType | undefined,
    userId?: string,
  ) {
    const connection = await this.connections.resolve(organizationId, provider);
    const resolvedProvider = connection.provider as CrmProviderType;
    const before = (connection.metadata || {}) as CrmConnectionMetadata;
    const existingStartedAt = this.date(before.syncStartedAt);
    if (
      before.syncStatus === 'SYNCING' &&
      existingStartedAt &&
      Date.now() - existingStartedAt.getTime() < 15 * 60_000
    ) {
      return {
        provider: resolvedProvider,
        status: 'IN_PROGRESS',
        synchronized: 0,
      };
    }
    const startedAt = new Date();
    const syncSince = before.syncCursor
      ? this.date(before.syncSince)
      : this.date(before.lastSyncedAt);
    const claimed = await this.connectionsRepository.claimSync(
      organizationId,
      resolvedProvider,
      {
        ...before,
        syncStatus: 'SYNCING',
        syncStartedAt: startedAt.toISOString(),
        lastSyncError: undefined,
      } satisfies CrmConnectionMetadata,
      new Date(startedAt.getTime() - 15 * 60_000),
    );
    if (!claimed) {
      return {
        provider: resolvedProvider,
        status: 'IN_PROGRESS',
        synchronized: 0,
      };
    }

    try {
      const result = await this.connections.execute(
        organizationId,
        resolvedProvider,
        async ({ accessToken, metadata }) => {
          const client = this.providers.get(resolvedProvider);
          let cursor = before.syncCursor;
          let pageCount = 0;
          let synchronized = 0;
          let done = false;
          while (pageCount < MAX_PAGES_PER_RUN && !done) {
            const page = await client.listDeals(accessToken, {
              cursor,
              modifiedSince: syncSince,
              instanceUrl: metadata.instanceUrl,
            });
            synchronized += await this.deals.upsertMany(
              organizationId,
              resolvedProvider,
              page.items,
              startedAt,
            );
            cursor = page.cursor;
            done = page.done;
            pageCount += 1;
          }
          return { synchronized, pageCount, done, cursor };
        },
      );
      const nextMetadata: CrmConnectionMetadata = {
        ...before,
        syncStatus: 'IDLE',
        lastSyncedAt: result.done
          ? startedAt.toISOString()
          : before.lastSyncedAt,
        ...(result.done
          ? { syncCursor: undefined, syncSince: undefined }
          : {
              syncCursor: result.cursor,
              syncSince: (syncSince || startedAt).toISOString(),
            }),
        syncStartedAt: undefined,
        lastSyncError: undefined,
        reconnectRequired: false,
      };
      await this.connectionsRepository.update(
        organizationId,
        resolvedProvider,
        {
          metadata: nextMetadata,
        },
      );
      if (userId) {
        await this.auditLogs.create({
          organizationId,
          userId,
          action: 'CRM_SYNC_REQUESTED',
          resourceType: 'integration',
          resourceId: resolvedProvider,
          metadata: {
            provider: resolvedProvider,
            synchronized: result.synchronized,
            completed: result.done,
          },
        });
      }
      return {
        provider: resolvedProvider,
        status: result.done ? 'SYNCHRONIZED' : 'PARTIAL',
        synchronized: result.synchronized,
        pages: result.pageCount,
        lastSyncedAt: nextMetadata.lastSyncedAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'CRM sync failed';
      await this.connectionsRepository
        .update(organizationId, resolvedProvider, {
          metadata: {
            ...before,
            syncStatus: 'FAILED',
            syncStartedAt: undefined,
            lastSyncError: message.slice(0, 1000),
          } satisfies CrmConnectionMetadata,
        })
        .catch(() => undefined);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async synchronizeDueConnections(now = new Date()) {
    try {
      const connections = await this.connectionsRepository.listConnected();
      for (const connection of connections) {
        const metadata = (connection.metadata || {}) as CrmConnectionMetadata;
        if (!this.isDue(metadata, now)) continue;
        await this.sync(
          connection.organizationId,
          connection.provider as CrmProviderType,
        ).catch((error: unknown) => {
          this.logger.warn(
            `CRM sync failed for ${connection.organizationId}:${connection.provider}: ${this.errorMessage(error)}`,
          );
        });
      }
    } catch (error) {
      this.logger.error(
        `CRM sync scheduler failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private isDue(metadata: CrmConnectionMetadata, now: Date) {
    if (metadata.syncStatus === 'SYNCING') {
      const startedAt = this.date(metadata.syncStartedAt);
      return !startedAt || now.getTime() - startedAt.getTime() > 15 * 60_000;
    }
    if (metadata.syncCursor) return true;
    const lastSyncedAt = this.date(metadata.lastSyncedAt);
    if (!lastSyncedAt) return true;
    // The scheduler checks every ten minutes while each connection has its own
    // configured minimum interval; no per-organization timer is created.
    return (
      now.getTime() - lastSyncedAt.getTime() >=
      this.config.get<number>('crm.syncIntervalMinutes', 30) * 60_000
    );
  }

  private date(value: unknown) {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
