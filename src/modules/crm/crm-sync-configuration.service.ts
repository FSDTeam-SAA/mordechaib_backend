import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  CrmObjectSyncConfiguration,
  CrmObjectSyncSelection,
  CrmObjectSyncState,
} from '../../common/types/crm-object-sync.interface';
import type {
  CrmConnectionMetadata,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmRepository } from './crm.repository';
import { CrmSchemaDiscoveryService } from './crm-schema-discovery.service';
import { UpdateCrmSyncConfigurationDto } from './dto/update-crm-sync-configuration.dto';

@Injectable()
export class CrmSyncConfigurationService {
  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly discovery: CrmSchemaDiscoveryService,
    private readonly repository: CrmRepository,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async update(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
    input: UpdateCrmSyncConfigurationDto,
  ) {
    const connection = await this.connections.resolve(organizationId, provider);
    const metadata = (connection.metadata || {}) as CrmConnectionMetadata;
    const selections = this.uniqueSelections(input.objects);

    await this.validateSelections(organizationId, provider, selections);

    const configuration: CrmObjectSyncConfiguration = {
      schemaVersion: '1.0',
      objects: selections,
      updatedAt: new Date().toISOString(),
      updatedByUserId: userId,
    };
    const states = this.nextStates(
      metadata.objectSync?.configuration?.objects || [],
      metadata.objectSync?.objects || [],
      selections,
    );

    const saved = await this.repository.updateObjectSync(
      organizationId,
      provider,
      configuration,
      states,
    );
    if (!saved) {
      throw new BadRequestException(
        `Connect ${provider} before configuring synchronization`,
      );
    }

    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_SYNC_CONFIGURATION_UPDATED',
      resourceType: 'integration',
      resourceId: provider,
      metadata: {
        provider,
        objectTypes: selections.map(({ objectType }) => objectType),
        objectCount: selections.length,
      },
    });

    return { provider, configuration, objects: states };
  }

  private uniqueSelections(
    objects: UpdateCrmSyncConfigurationDto['objects'],
  ): CrmObjectSyncSelection[] {
    const seen = new Set<string>();
    return objects.map(({ objectType, fields }) => {
      if (seen.has(objectType)) {
        throw new BadRequestException(
          `Object ${objectType} is configured more than once`,
        );
      }
      seen.add(objectType);
      return { objectType, fields: [...fields] };
    });
  }

  private async validateSelections(
    organizationId: string,
    provider: CrmProviderType,
    selections: CrmObjectSyncSelection[],
  ) {
    if (selections.length === 0) return;

    const discovery = await this.discovery.listObjects(
      organizationId,
      provider,
    );
    const available = new Map(
      discovery.objects.map((object) => [object.objectType, object]),
    );

    for (const selection of selections) {
      const object = available.get(selection.objectType);
      if (!object?.readable) {
        throw new BadRequestException(
          `CRM object ${selection.objectType} is unavailable or not readable`,
        );
      }

      const schema = await this.discovery.describeObject(
        organizationId,
        provider,
        selection.objectType,
      );
      const readableFields = new Set(
        schema.fields
          .filter((field) => field.readable)
          .map((field) => field.name),
      );
      const invalidFields = selection.fields.filter(
        (field) => !readableFields.has(field),
      );
      if (invalidFields.length > 0) {
        throw new BadRequestException(
          `CRM object ${selection.objectType} has unavailable or unreadable fields: ${invalidFields.join(', ')}`,
        );
      }
    }
  }

  private nextStates(
    previousSelections: CrmObjectSyncSelection[],
    previousStates: CrmObjectSyncState[],
    nextSelections: CrmObjectSyncSelection[],
  ): CrmObjectSyncState[] {
    const previousFields = new Map(
      previousSelections.map(({ objectType, fields }) => [
        objectType,
        this.fieldSignature(fields),
      ]),
    );
    const states = new Map(
      previousStates.map((state) => [state.objectType, state]),
    );

    return nextSelections.map(({ objectType, fields }) => {
      const unchanged =
        previousFields.get(objectType) === this.fieldSignature(fields);
      return unchanged && states.has(objectType)
        ? { ...states.get(objectType)! }
        : { objectType, status: 'IDLE' };
    });
  }

  private fieldSignature(fields: string[]) {
    return [...fields].sort().join('\u0000');
  }
}
