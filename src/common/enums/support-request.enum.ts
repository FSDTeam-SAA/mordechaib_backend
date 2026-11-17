export enum SupportRequestCategory {
  ACCOUNT = 'ACCOUNT',
  BILLING = 'BILLING',
  TECHNICAL = 'TECHNICAL',
  INTEGRATION = 'INTEGRATION',
  AI_ASSISTANT = 'AI_ASSISTANT',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  OTHER = 'OTHER',
}

export enum SupportRequestStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum SupportRequestPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum SupportRequestActorType {
  ORGANIZER = 'ORGANIZER',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  SYSTEM = 'SYSTEM',
}

export enum SupportRequestEventType {
  CREATED = 'CREATED',
  REPLIED = 'REPLIED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ASSIGNED = 'ASSIGNED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
}

export enum SupportAttachmentStatus {
  ACTIVE = 'ACTIVE',
  DELETION_PENDING = 'DELETION_PENDING',
  DELETED = 'DELETED',
  DELETE_FAILED = 'DELETE_FAILED',
}
