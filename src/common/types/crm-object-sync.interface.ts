import type { CrmProviderType } from './crm-provider.interface';

export type CrmObjectSyncStatus =
  'IDLE' | 'SYNCING' | 'SYNCHRONIZED' | 'PARTIAL' | 'FAILED';

export type CrmFieldDataType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'ENUMERATION'
  | 'REFERENCE'
  | 'OTHER';

export type CrmObjectDescriptor = {
  objectType: string;
  label: string;
  pluralLabel: string;
  custom: boolean;
  readable: boolean;
  createable: boolean;
  updateable: boolean;
  deletable: boolean;
};

export type CrmFieldOption = {
  label: string;
  value: string;
  active: boolean;
};

export type CrmObjectField = {
  name: string;
  label: string;
  dataType: CrmFieldDataType;
  providerType: string;
  custom: boolean;
  required: boolean;
  readable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  sortable: boolean;
  unique: boolean;
  calculated: boolean;
  referenceTo: string[];
  options: CrmFieldOption[];
};

export type CrmObjectSchema = CrmObjectDescriptor & {
  fields: CrmObjectField[];
};

export type CrmObjectSyncSelection = {
  objectType: string;
  fields: string[];
};

export type CrmObjectSyncConfiguration = {
  schemaVersion: '1.0';
  objects: CrmObjectSyncSelection[];
  updatedAt?: string;
  updatedByUserId?: string;
};

export type CrmObjectSyncState = {
  objectType: string;
  status: CrmObjectSyncStatus;
  cursor?: string;
  syncSince?: string;
  syncStartedAt?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
  synchronized?: number;
  hasMore?: boolean;
};

export type CrmMultiObjectSyncMetadata = {
  configuration?: CrmObjectSyncConfiguration;
  objects?: CrmObjectSyncState[];
};

export type CrmRecordAssociations = Record<string, string[]>;

export type NormalizedCrmRecord = {
  objectType: string;
  externalId: string;
  properties: Record<string, unknown>;
  associations?: CrmRecordAssociations;
  providerCreatedAt?: Date;
  providerUpdatedAt?: Date;
  archived: boolean;
  rawPayload?: Record<string, unknown>;
};

export type CrmRecordPage = {
  provider: CrmProviderType;
  objectType: string;
  items: NormalizedCrmRecord[];
  cursor?: string;
  done: boolean;
};

export type ListCrmRecordsInput = {
  objectType: string;
  fields: string[];
  cursor?: string;
  modifiedSince?: Date;
  instanceUrl?: string;
};

export type CrmRecordsWriteResult = {
  processed: number;
  matched: number;
  modified: number;
  upserted: number;
};
