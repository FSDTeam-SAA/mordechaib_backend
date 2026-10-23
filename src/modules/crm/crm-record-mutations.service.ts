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

@Injectable()
export class CrmRecordMutationsService {
  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly providers: CrmProviderRegistry,
    private readonly records: CrmRecordsRepository,
  ) {}

  async prepareUpdate(
    organizationId: string,
    input: UpdateCrmRecordActionDto,
  ): Promise<UpdateCrmRecordActionDto> {
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
    this.assertVersion(input.expectedProviderUpdatedAt, record.providerUpdatedAt);
    const properties = this.properties(input.properties, schema);
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
      schemaFingerprint: this.schemaFingerprint(schema),
      preview: {
        recordId: String(record._id),
        before,
        after: { ...before, ...properties },
      },
    };
  }

  async executeUpdate(
    organizationId: string,
    input: UpdateCrmRecordActionDto,
  ) {
    const prepared = await this.prepareUpdate(organizationId, input);
    if (
      input.schemaFingerprint &&
      input.schemaFingerprint !== prepared.schemaFingerprint
    ) {
      throw new ConflictException(
        'CRM schema changed after this proposal was prepared; review it again',
      );
    }
    const updated = await this.connections
      .execute(organizationId, prepared.provider, ({ accessToken, metadata }) =>
        this.providers.get(prepared.provider).updateRecord(accessToken, {
          objectType: prepared.objectType,
          externalId: prepared.externalId,
          properties: prepared.properties,
          fields: this.returnFields(prepared),
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
    return {
      id: prepared.preview!.recordId,
      provider: prepared.provider,
      objectType: prepared.objectType,
      externalId: prepared.externalId,
      properties: updated.properties,
      providerUpdatedAt: updated.providerUpdatedAt?.toISOString(),
    };
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
  ) {
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
        if (!field || !field.updateable || field.calculated) {
          throw new BadRequestException(
            `${name} is not an updateable ${schema.label} field`,
          );
        }
        return [name, this.value(value, field)];
      }),
    );
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
        field.options.filter((option) => option.active).map((option) => option.value),
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

  private schemaFingerprint(schema: CrmObjectSchema) {
    const writable = schema.fields
      .filter((field) => field.updateable && !field.calculated)
      .map((field) => ({
        name: field.name,
        type: field.dataType,
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

  private returnFields(input: UpdateCrmRecordActionDto) {
    return [...new Set([
      ...Object.keys(input.preview?.before || {}),
      ...Object.keys(input.properties),
    ])];
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
