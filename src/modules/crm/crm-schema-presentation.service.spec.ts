import type { CrmObjectSchema } from '../../common/types/crm-object-sync.interface';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { CrmSchemaPresentationService } from './crm-schema-presentation.service';
import {
  CrmSchemaView,
  GetCrmObjectSchemaQueryDto,
} from './dto/get-crm-object-schema-query.dto';

describe('CrmSchemaPresentationService', () => {
  const service = new CrmSchemaPresentationService();

  it('returns only useful readable fields in the default view', () => {
    const result = service.present(
      IntegrationProvider.HUBSPOT,
      schema(),
      query(),
    );

    expect(result.fields.map(({ name }) => name)).toEqual([
      'email',
      'custom_customer_tier',
    ]);
    expect(result.fieldSummary).toEqual({
      total: 4,
      readable: 3,
      essential: 2,
      custom: 2,
      returned: 2,
    });
  });

  it('supports full schema search and pagination', () => {
    const result = service.present(
      IntegrationProvider.HUBSPOT,
      schema(),
      query({ view: CrmSchemaView.FULL, search: 'owner', limit: 1 }),
    );

    expect(result.fields.map(({ name }) => name)).toEqual(['hs_all_owner_ids']);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      pages: 1,
    });
  });

  it('retains task activity fields in the essential view', () => {
    const taskSchema = schema();
    taskSchema.objectType = 'tasks';
    taskSchema.fields = [
      {
        ...taskSchema.fields[0],
        name: 'hs_task_subject',
        label: 'Task subject',
        unique: false,
      },
      {
        ...taskSchema.fields[0],
        name: 'hs_task_status',
        label: 'Task status',
        unique: false,
      },
    ];

    expect(
      service.essentialFields(IntegrationProvider.HUBSPOT, taskSchema),
    ).toEqual(['hs_task_subject', 'hs_task_status']);
  });

  function query(
    overrides: Partial<GetCrmObjectSchemaQueryDto> = {},
  ): GetCrmObjectSchemaQueryDto {
    return Object.assign(new GetCrmObjectSchemaQueryDto(), overrides);
  }

  function schema(): CrmObjectSchema {
    const base = {
      dataType: 'STRING' as const,
      providerType: 'string',
      required: false,
      createable: false,
      updateable: false,
      filterable: false,
      sortable: false,
      unique: false,
      calculated: false,
      referenceTo: [],
      options: [],
    };
    return {
      objectType: 'contacts',
      label: 'Contact',
      pluralLabel: 'Contacts',
      custom: false,
      readable: true,
      createable: true,
      updateable: true,
      deletable: true,
      fields: [
        {
          ...base,
          name: 'email',
          label: 'Email',
          custom: false,
          readable: true,
          createable: true,
          updateable: true,
          unique: true,
        },
        {
          ...base,
          name: 'hs_all_owner_ids',
          label: 'All owner IDs',
          custom: true,
          readable: true,
        },
        {
          ...base,
          name: 'custom_customer_tier',
          label: 'Customer tier',
          custom: true,
          readable: true,
        },
        {
          ...base,
          name: 'hidden_field',
          label: 'Hidden field',
          custom: false,
          readable: false,
        },
      ],
    };
  }
});
