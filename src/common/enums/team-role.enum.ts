/**
 * Roles for platform-team members (Noltra staff), as opposed to UserRole
 * which scopes a customer's own organization users. Kept separate from
 * UserRole intentionally — a team member is not tied to any organization.
 *
 * Hierarchy (highest to lowest): SUPER_ADMIN > ADMIN > SUB_ADMIN.
 * See TeamService for who is allowed to invite/manage whom.
 */
export enum TeamRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  SUB_ADMIN = 'SUB_ADMIN',
}
