import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import crypto from 'crypto';
import {
  CrmProviderHttpError,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import type {
  CrmObjectField,
  CrmObjectSchema,
} from '../../common/types/crm-object-sync.interface';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRecordsRepository } from './crm-records.repository';
import { UpdateCrmRecordActionDto } from './dto/update-crm-record-action.dto';

const MAX_MUTATED_FIELDS = 50;

export type CreateCrmRecordMutation = {
  provider: CrmProviderType;
  objectType: string;
  properties: Record<string, unknown>;
  schemaFingerprint?: string;
};

@Injectable()
export class CrmRecordMutationsService {
  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly providers: CrmProviderRegistry,
    private readonly records: CrmRecordsRepository,
  ) {}

  async prepareCreate(
    organizationId: string,
    input: CreateCrmRecordMutation,
  ): Promise<CreateCrmRecordMutation> {
    this.assertObjectType(input.objectType);
    const schema = await this.describe(
      organizationId,
      input.provider,
      input.objectType,
    );
    if (!schema.createable) {
      throw new ForbiddenException(
        `${schema.label} records cannot be created with this CRM connection`,
      );
    }
    const properties = this.properties(input.properties, schema, 'CREATE');
    this.assertRequiredCreateFields(properties, schema);
    return {
      provider: input.provider,
      objectType: schema.objectType,
      properties,
      schemaFingerprint: this.schemaFingerprint(schema, 'CREATE'),
    };
  }

  async executeCreate(organizationId: string, input: CreateCrmRecordMutation) {
    const prepared = await this.prepareCreate(organizationId, input);
    if (
      input.schemaFingerprint &&
      input.schemaFingerprint !== prepared.schemaFingerprint
    ) {
      throw new ConflictException(
        'CRM schema changed after this record was prepared; review it again',
      );
    }
    const created = await this.connections
      .execute(organizationId, prepared.provider, ({ accessToken, metadata }) =>
        this.providers.get(prepared.provider).createRecord(accessToken, {
          objectType: prepared.objectType,
          properties: prepared.properties,
          fields: Object.keys(prepared.properties),
          instanceUrl: metadata.instanceUrl,
        }),
      )
      .catch((error: unknown) => this.providerError(error));
    await this.records.upsertMany(
      organizationId,
      prepared.provider,
      [created],
      new Date(),
    );
    const stored = await this.records.findByExternalId(
      organizationId,
      prepared.provider,
      prepared.objectType,
      created.externalId,
    );
    if (!stored) {
      throw new ServiceUnavailableException(
        'CRM record was created but could not be synchronized locally',
      );
    }
    return stored;
  }

  async prepareUpdate(
    organizationId: string,
    input: UpdateCrmRecordActionDto,
  ): Promise<UpdateCrmRecordActionDto> {
    this.assertObjectType(input.objectType);
    this.assertExternalId(input.externalId);
    const schema = await this.describe(
      organizationId,
      input.provider,
      input.objectType,
    );
    if (!schema.updateable) {
      throw new ForbiddenException(
        `${schema.label} records cannot be updated with this CRM connection`,
      );
    }
    const record = await this.records.findByExternalId(
      organizationId,
      input.provider,
      schema.objectType,
      input.externalId,
    );
    if (!record || record.archived) {
      throw new NotFoundException('Synchronized CRM record not found');
    }
    this.assertVersion(
      input.expectedProviderUpdatedAt,
      record.providerUpdatedAt,
    );
    const properties = this.properties(input.properties, schema, 'UPDATE');
    const before = Object.fromEntries(
      Object.keys(properties).map((field) => [
        field,
        record.properties?.[field] ?? null,
      ]),
    );
    return {
      provider: input.provider,
      objectType: schema.objectType,
      externalId: input.externalId,
      properties,
      expectedProviderUpdatedAt:
        input.expectedProviderUpdatedAt ||
        record.providerUpdatedAt?.toISOString(),
      schemaFingerprint: this.schemaFingerprint(schema, 'UPDATE'),
      preview: {
        recordId: String(record._id),
        before,
        after: { ...before, ...properties },
      },
    };
  }

  async executeUpdate(organizationId: string, input: UpdateCrmRecordActionDto) {
    const prepared = await this.prepareUpdate(organizationId, input);
    if (
      input.schemaFingerprint &&
      input.schemaFingerprint !== prepared.schemaFingerprint
    ) {
      throw new ConflictException(
        'CRM schema changed after this proposal was prepared; review it again',
      );
    }
    const current = await this.records.findByExternalId(
      organizationId,
      prepared.provider,
      prepared.objectType,
      prepared.externalId,
    );
    if (!current || current.archived) {
      throw new NotFoundException('Synchronized CRM record not found');
    }
    this.assertVersion(
      prepared.expectedProviderUpdatedAt,
      current.providerUpdatedAt,
    );
    const updated = await this.connections
      .execute(organizationId, prepared.provider, ({ accessToken, metadata }) =>
        this.providers.get(prepared.provider).updateRecord(accessToken, {
          objectType: prepared.objectType,
          externalId: prepared.externalId,
          properties: prepared.properties,
          fields: this.returnFields(current.properties, prepared.properties),
          instanceUrl: metadata.instanceUrl,
        }),
      )
      .catch((error: unknown) => this.providerError(error));
    await this.records.upsertMany(
      organizationId,
      prepared.provider,
      [updated],
      new Date(),
    );
    const stored = await this.records.findByExternalId(
      organizationId,
      prepared.provider,
      prepared.objectType,
      prepared.externalId,
    );
    if (!stored) {
      throw new ServiceUnavailableException(
        'CRM record was updated but could not be synchronized locally',
      );
    }
    return { ...stored, id: String(stored._id) };
  }

  private async describe(
    organizationId: string,
    provider: CrmProviderType,
    objectType: string,
  ) {
    return this.connections
      .execute(organizationId, provider, ({ accessToken, metadata }) =>
        this.providers.get(provider).describeObject(accessToken, objectType, {
          instanceUrl: metadata.instanceUrl,
          scopes: metadata.scopes,
        }),
      )
      .catch((error: unknown) => this.providerError(error));
  }

  private properties(
    input: Record<string, unknown>,
    schema: CrmObjectSchema,
    operation: 'CREATE' | 'UPDATE',
  ) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('properties must be an object');
    }
    const entries = Object.entries(input);
    if (!entries.length || entries.length > MAX_MUTATED_FIELDS) {
      throw new BadRequestException(
        `properties must contain between 1 and ${MAX_MUTATED_FIELDS} fields`,
      );
    }
    const fields = new Map(schema.fields.map((field) => [field.name, field]));
    return Object.fromEntries(
      entries.map(([name, value]) => {
        const field = fields.get(name);
        const permitted =
          operation === 'CREATE' ? field?.createable : field?.updateable;
        if (!field || !permitted || field.calculated) {
          throw new BadRequestException(
            `${name} is not a ${operation === 'CREATE' ? 'createable' : 'updateable'} ${schema.label} field`,
          );
        }
        return [name, this.value(value, field)];
      }),
    );
  }

  private assertRequiredCreateFields(
    properties: Record<string, unknown>,
    schema: CrmObjectSchema,
  ) {
    const missing = schema.fields
      .filter(
        (field) => field.required && field.createable && !field.calculated,
      )
      .filter((field) => {
        const value = properties[field.name];
        return (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.length === 0)
        );
      })
      .map((field) => field.name);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required ${schema.label} fields: ${missing.join(', ')}`,
      );
    }
  }

  private value(value: unknown, field: CrmObjectField): unknown {
    if (value === null) return null;
    if (field.dataType === 'NUMBER') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`${field.name} must be a number`);
      }
      return value;
    }
    if (field.dataType === 'BOOLEAN') {
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`${field.name} must be a boolean`);
      }
      return value;
    }
    if (field.dataType === 'DATE') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException(`${field.name} must be YYYY-MM-DD`);
      }
      return value;
    }
    if (field.dataType === 'DATETIME') {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new BadRequestException(`${field.name} must be an ISO datetime`);
      }
      return new Date(value).toISOString();
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field.name} must be a string`);
    }
    const normalized = value.trim();
    if (field.dataType === 'ENUMERATION' && field.options.length) {
      const allowed = new Set(
        field.options
          .filter((option) => option.active)
          .map((option) => option.value),
      );
      if (!allowed.has(normalized)) {
        throw new BadRequestException(`${field.name} has an invalid option`);
      }
    }
    return normalized;
  }

  private assertVersion(expected?: string, actual?: Date) {
    if (!expected) return;
    if (!actual || new Date(expected).getTime() !== actual.getTime()) {
      throw new ConflictException(
        'CRM record changed after it was selected; refresh before approving',
      );
    }
  }

  private schemaFingerprint(
    schema: CrmObjectSchema,
    operation: 'CREATE' | 'UPDATE',
  ) {
    const writable = schema.fields
      .filter(
        (field) =>
          (operation === 'CREATE' ? field.createable : field.updateable) &&
          !field.calculated,
      )
      .map((field) => ({
        name: field.name,
        type: field.dataType,
        required: operation === 'CREATE' ? field.required : undefined,
        options: field.options
          .filter((option) => option.active)
          .map((option) => option.value)
          .sort(),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(writable))
      .digest('hex');
  }

  private assertObjectType(objectType: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(objectType)) {
      throw new BadRequestException('CRM object type is invalid');
    }
  }

  private assertExternalId(externalId: string) {
    if (
      !externalId ||
      externalId.length > 255 ||
      /[\u0000-\u001f\u007f]/.test(externalId)
    ) {
      throw new BadRequestException('CRM record external id is invalid');
    }
  }

  private returnFields(
    current: Record<string, unknown> | undefined,
    changes: Record<string, unknown>,
  ) {
    return [
      ...new Set([...Object.keys(current || {}), ...Object.keys(changes)]),
    ];
  }

  private providerError(error: unknown): never {
    if (!(error instanceof CrmProviderHttpError)) throw error;
    if (error.statusCode === 400) throw new BadRequestException(error.message);
    if (error.statusCode === 403) throw new ForbiddenException(error.message);
    if (error.statusCode === 404) throw new NotFoundException(error.message);
    if (error.statusCode === 409) throw new ConflictException(error.message);
    if (error.statusCode === 429 || error.statusCode >= 500) {
      throw new ServiceUnavailableException(error.message);
    }
    throw new BadGatewayException(error.message);
  }
}
