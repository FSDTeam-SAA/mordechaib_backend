/**
 * Module/tab permissions that can be granted to an organization team member
 * within the User Dashboard (Noltra customer platform).
 */
export enum OrgPermission {
  DASHBOARD = 'Dashboard',
  CALL_INTELLIGENCE = 'Call Intelligence',
  CUSTOMER = 'Customer',
  AI_CHIEF_OF_STAFF = 'AI Chief of Staff',
  AI_AGENTS = 'AI Agents',
  CRM = 'CRM',
  ROI_DASHBOARD = 'ROI Dashboard',
  TASK = 'Task',
  CALENDAR = 'Calendar',
  OPERATIONAL_DIAGNOSTIC = 'Operational Diagnostic',
  SETTINGS = 'Settings',
  HELP_AND_SUPPORT = 'Help & Support',
  ALL_ACCESS = 'All Access',
}

export const ALL_ORG_PERMISSIONS: OrgPermission[] = [
  OrgPermission.DASHBOARD,
  OrgPermission.CALL_INTELLIGENCE,
  OrgPermission.CUSTOMER,
  OrgPermission.AI_CHIEF_OF_STAFF,
  OrgPermission.AI_AGENTS,
  OrgPermission.CRM,
  OrgPermission.ROI_DASHBOARD,
  OrgPermission.TASK,
  OrgPermission.CALENDAR,
  OrgPermission.OPERATIONAL_DIAGNOSTIC,
  OrgPermission.SETTINGS,
  OrgPermission.HELP_AND_SUPPORT,
];
