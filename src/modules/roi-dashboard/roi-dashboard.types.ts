export type RoiActionCounts = {
  taskCreations: number;
  meetingSchedules: number;
  crmUpdates: number;
  emailDrafts: number;
};

export type RoiConfigurationView = {
  organizationId: string;
  methodologyVersion: string;
  source: 'PLATFORM_DEFAULT' | 'ORGANIZATION_OVERRIDE';
  isEstimated: true;
  taskCreationMinutes: number;
  meetingSchedulingMinutes: number;
  crmUpdateMinutes: number;
  emailDraftMinutes: number;
  hourlyLaborCost: number;
  currency: string;
  updatedAt: string | null;
};

export type RoiDashboardSnapshot = Record<string, unknown> & {
  organization: { id: string; name: string };
  asOf: string;
  timezone: string;
  configuration: RoiConfigurationView;
  range: { key: string; start: string; end: string; days: number };
  cards: Record<string, unknown>;
  projection: Record<string, unknown>;
  savingsTrend: Array<Record<string, unknown>>;
  growthOverview: Record<string, unknown>;
  tasksByAgent: Record<string, unknown>;
  timeSavedByCategory: Array<Record<string, unknown>>;
  savingsBreakdown: Record<string, unknown>;
  crmRevenue: unknown;
};
