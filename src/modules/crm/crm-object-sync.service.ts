import { ConflictException, Injectable } from '@nestjs/common';
import type {
  CrmObjectSyncSelection,
  CrmObjectSyncState,
} from '../../common/types/crm-object-sync.interface';
import type {
  CrmConnectionMetadata,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRecordsRepository } from './crm-records.repository';
import { CrmRepository } from './crm.repository';

const MAX_PAGES_PER_OBJECT_RUN = 20;

type ObjectSyncResult = {
  objectType: string;
  status: 'SYNCHRONIZED' | 'PARTIAL' | 'FAILED';
  synchronized: number;
  pages: number;
  error?: string;
};

@Injectable()
export class CrmObjectSyncService {
  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly providers: CrmProviderRegistry,
    private readonly connectionsRepository: CrmRepository,
    private readonly records: CrmRecordsRepository,
  ) {}

  async syncConfigured(organizationId: string, provider: CrmProviderType) {
    const connection = await this.connections.resolve(organizationId, provider);
    const metadata = (connection.metadata || {}) as CrmConnectionMetadata;
    const configuration = metadata.objectSync?.configuration;
    if (!configuration?.objects.length) {
      return {
        status: 'NOT_CONFIGURED' as const,
        synchronized: 0,
        objects: [] as ObjectSyncResult[],
      };
    }
    if (!configuration.updatedAt) {
      throw new ConflictException(
        'CRM sync configuration version is missing; save the configuration again',
      );
    }

    let states = this.configuredStates(
      configuration.objects,
      metadata.objectSync?.objects || [],
    );
    const results: ObjectSyncResult[] = [];

    for (const selection of configuration.objects) {
      const current = states.find(
        (state) => state.objectType === selection.objectType,
      )!;
      const startedAt = new Date();
      const syncSince = current.cursor
        ? this.date(current.syncSince)
        : this.date(current.lastSyncedAt);

      states = this.replaceState(states, selection.objectType, {
        ...current,
        status: 'SYNCING',
        syncStartedAt: startedAt.toISOString(),
        lastSyncError: undefined,
      });
      await this.persistStates(
        organizationId,
        provider,
        configuration.updatedAt,
        states,
      );

      try {
        const result = await this.synchronizeObject(
          organizationId,
          provider,
          selection,
          current.cursor,
          syncSince,
          startedAt,
        );
        const nextState: CrmObjectSyncState = {
          objectType: selection.objectType,
          status: result.done ? 'SYNCHRONIZED' : 'PARTIAL',
          synchronized: result.synchronized,
          hasMore: !result.done,
          ...(result.done
            ? { lastSyncedAt: startedAt.toISOString() }
            : {
                cursor: result.cursor,
                syncSince: (syncSince || startedAt).toISOString(),
              }),
        };
        states = this.replaceState(states, selection.objectType, nextState);
        await this.persistStates(
          organizationId,
          provider,
          configuration.updatedAt,
          states,
        );
        results.push({
          objectType: selection.objectType,
          status: nextState.status as 'SYNCHRONIZED' | 'PARTIAL',
          synchronized: result.synchronized,
          pages: result.pages,
        });
      } catch (error) {
        const message = this.errorMessage(error);
        states = this.replaceState(states, selection.objectType, {
          ...current,
          status: 'FAILED',
          syncStartedAt: undefined,
          lastSyncError: message.slice(0, 1000),
        });
        await this.persistStates(
          organizationId,
          provider,
          configuration.updatedAt,
          states,
        ).catch(() => undefined);
        results.push({
          objectType: selection.objectType,
          status: 'FAILED',
          synchronized: 0,
          pages: 0,
          error: message,
        });
      }
    }

    const failures = results.filter(({ status }) => status === 'FAILED').length;
    const partial = results.some(({ status }) => status === 'PARTIAL');
    return {
      status:
        failures === results.length
          ? ('FAILED' as const)
          : failures > 0 || partial
            ? ('PARTIAL' as const)
            : ('SYNCHRONIZED' as const),
      synchronized: results.reduce(
        (total, result) => total + result.synchronized,
        0,
      ),
      objects: results,
    };
  }

  private synchronizeObject(
    organizationId: string,
    provider: CrmProviderType,
    selection: CrmObjectSyncSelection,
    initialCursor: string | undefined,
    modifiedSince: Date | undefined,
    syncedAt: Date,
  ) {
    return this.connections.execute(
      organizationId,
      provider,
      async ({ accessToken, metadata }) => {
        const client = this.providers.get(provider);
        let cursor = initialCursor;
        let pages = 0;
        let synchronized = 0;
        let done = false;

        while (pages < MAX_PAGES_PER_OBJECT_RUN && !done) {
          const page = await client.listRecords(accessToken, {
            objectType: selection.objectType,
            fields: selection.fields,
            cursor,
            modifiedSince,
            instanceUrl: metadata.instanceUrl,
          });
          const write = await this.records.upsertMany(
            organizationId,
            provider,
            page.items,
            syncedAt,
          );
          synchronized += write.processed;
          cursor = page.cursor;
          done = page.done;
          pages += 1;
        }

        return { synchronized, pages, done, cursor };
      },
    );
  }

  private configuredStates(
    selections: CrmObjectSyncSelection[],
    states: CrmObjectSyncState[],
  ) {
    const existing = new Map(states.map((state) => [state.objectType, state]));
    return selections.map(
      ({ objectType }) =>
        existing.get(objectType) || { objectType, status: 'IDLE' as const },
    );
  }

  private replaceState(
    states: CrmObjectSyncState[],
    objectType: string,
    replacement: CrmObjectSyncState,
  ) {
    return states.map((state) =>
      state.objectType === objectType ? replacement : state,
    );
  }

  private async persistStates(
    organizationId: string,
    provider: CrmProviderType,
    configurationUpdatedAt: string,
    states: CrmObjectSyncState[],
  ) {
    const saved = await this.connectionsRepository.updateObjectSyncStates(
      organizationId,
      provider,
      configurationUpdatedAt,
      states,
    );
    if (!saved) {
      throw new ConflictException(
        'CRM sync configuration changed while synchronization was running; retry the sync',
      );
    }
  }

  private date(value: unknown) {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'CRM object sync failed';
  }
}
