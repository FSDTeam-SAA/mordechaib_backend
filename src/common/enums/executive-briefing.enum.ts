export enum ExecutiveBriefingType {
  TODAY = 'TODAY',
  TEAM_CHALLENGES = 'TEAM_CHALLENGES',
  WEEKLY_REVIEW = 'WEEKLY_REVIEW',
}

export enum ExecutiveBriefingStatus {
  QUEUED = 'QUEUED',
  GENERATING = 'GENERATING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum BriefingFactAvailability {
  AVAILABLE = 'AVAILABLE',
  PARTIAL = 'PARTIAL',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum StrategicNoteKind {
  NOTE = 'NOTE',
  STRATEGIC_SHIFT = 'STRATEGIC_SHIFT',
  STRATEGY = 'STRATEGY',
  PIVOT = 'PIVOT',
  BLOCKER = 'BLOCKER',
}
