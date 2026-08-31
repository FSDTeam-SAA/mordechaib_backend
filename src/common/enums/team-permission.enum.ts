/**
 * Module-level permissions that can be granted to a platform team member.
 *
 * NOTE: values are kept EXACTLY as provided (including "Dashborad",
 * "Meeting Calender", "opertional diagonistic") so they match whatever the
 * frontend / existing data already uses. If those are just typos on your
 * side and nothing else depends on the literal strings yet, it's worth
 * fixing them here (and only here) before you ship — this enum is the
 * single source of truth once wired up.
 */
export enum TeamPermission {
  DASHBOARD = 'Dashborad',
  ORGANIZATION = 'Organization',
  SUBSCRIPTION = 'Subscription',
  REVENUE_AND_ANALYTICS = 'Revenue & Analytics',
  MEETING_CALENDAR = 'Meeting Calender',
  ROLES_AND_PERMISSIONS = 'Roles & Permissions',
  OPERATIONAL_DIAGNOSTIC = 'opertional diagonistic',
  HELP_AND_SUPPORT = 'Help & Support',
  SETTINGS = 'Settings',
  ALL_ACCESS = 'All Access',
}
