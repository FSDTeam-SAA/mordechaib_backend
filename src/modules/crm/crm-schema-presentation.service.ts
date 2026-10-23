import { Injectable } from '@nestjs/common';
import type {
  CrmObjectField,
  CrmObjectSchema,
} from '../../common/types/crm-object-sync.interface';
import type { CrmProviderType } from '../../common/types/crm-provider.interface';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import {
  CrmSchemaView,
  GetCrmObjectSchemaQueryDto,
} from './dto/get-crm-object-schema-query.dto';

const HUBSPOT_ESSENTIAL_SYSTEM_FIELDS = new Set([
  'hs_object_id',
  'hs_createdate',
  'hs_lastmodifieddate',
  'hs_lead_status',
]);

const HUBSPOT_ACTIVITY_FIELD_PREFIXES: Record<string, string[]> = {
  tasks: ['hs_task_', 'hs_timestamp'],
};

@Injectable()
export class CrmSchemaPresentationService {
  essentialFields(
    provider: CrmProviderType,
    schema: CrmObjectSchema,
    limit = 200,
  ) {
    return schema.fields
      .filter((field) => this.isEssential(provider, schema.objectType, field))
      .sort(
        (left, right) => this.fieldPriority(right) - this.fieldPriority(left),
      )
      .slice(0, limit)
      .map((field) => field.name);
  }

  present(
    provider: CrmProviderType,
    schema: CrmObjectSchema,
    query: GetCrmObjectSchemaQueryDto,
  ) {
    const readableFields = schema.fields.filter((field) => field.readable);
    const eligibleFields = schema.fields
      .filter((field) =>
        query.view === CrmSchemaView.FULL
          ? true
          : this.isEssential(provider, schema.objectType, field),
      )
      .filter((field) => this.matchesSearch(field, query.search));
    const start = (query.page - 1) * query.limit;
    const fields = eligibleFields.slice(start, start + query.limit);

    return {
      ...schema,
      fields,
      fieldSummary: {
        total: schema.fields.length,
        readable: readableFields.length,
        essential: schema.fields.filter((field) =>
          this.isEssential(provider, schema.objectType, field),
        ).length,
        custom: schema.fields.filter((field) => field.custom).length,
        returned: fields.length,
      },
      pagination: {
        page: query.page,
        limit: query.limit,
        total: eligibleFields.length,
        pages: Math.max(Math.ceil(eligibleFields.length / query.limit), 1),
      },
      view: query.view,
    };
  }

  private isEssential(
    provider: CrmProviderType,
    objectType: string,
    field: CrmObjectField,
  ) {
    if (!field.readable) return false;
    if (provider === IntegrationProvider.HUBSPOT) {
      if (
        field.name.startsWith('hs_') &&
        !HUBSPOT_ESSENTIAL_SYSTEM_FIELDS.has(field.name) &&
        !this.matchesActivityField(objectType, field.name)
      ) {
        return false;
      }
    }
    if (field.custom || field.required || field.unique) return true;
    return field.createable || field.updateable || !field.calculated;
  }

  private matchesActivityField(objectType: string, fieldName: string) {
    return (HUBSPOT_ACTIVITY_FIELD_PREFIXES[objectType] || []).some((prefix) =>
      fieldName.startsWith(prefix),
    );
  }

  private matchesSearch(field: CrmObjectField, search?: string) {
    const normalized = search?.trim().toLocaleLowerCase();
    if (!normalized) return true;
    return (
      field.name.toLocaleLowerCase().includes(normalized) ||
      field.label.toLocaleLowerCase().includes(normalized)
    );
  }

  private fieldPriority(field: CrmObjectField) {
    if (field.required) return 5;
    if (field.unique) return 4;
    if (field.custom) return 3;
    if (field.createable || field.updateable) return 2;
    return field.calculated ? 0 : 1;
  }
}
