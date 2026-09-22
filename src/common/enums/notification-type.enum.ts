export enum NotificationType {
  AGENT_TASK_COMPLETED = 'AGENT_TASK_COMPLETED',
  MEETING_REMINDER = 'MEETING_REMINDER',
  WEEKLY_ROI_REPORT = 'WEEKLY_ROI_REPORT',
  PRODUCT_UPDATE = 'PRODUCT_UPDATE',
}

export enum NotificationEmailStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum NotificationReadFilter {
  ALL = 'ALL',
  UNREAD = 'UNREAD',
  READ = 'READ',
}

