# Team / Roles & Permissions module — integration guide

All new files live under `src/...` with the same relative paths as your
project, so you can drop the `src/` folder from this zip straight into your
repo (it will only add new files — nothing existing gets overwritten).

Verified: `npx tsc -p tsconfig.build.json --noEmit` passes cleanly against
your full codebase with these files added.

## New files

```
src/common/enums/team-role.enum.ts
src/common/enums/team-member-status.enum.ts
src/common/enums/team-permission.enum.ts
src/common/helpers/generate-temp-password.helper.ts
src/common/templates/team-invite.template.ts
src/database/schemas/team-member.schema.ts
src/modules/team/dto/create-team-member.dto.ts
src/modules/team/dto/update-team-member.dto.ts
src/modules/team/dto/list-team-members-query.dto.ts
src/modules/team/team.repository.ts
src/modules/team/team.service.ts
src/modules/team/team.controller.ts
src/modules/team/team.module.ts
```

## Two edits to existing files

Your project registers all Mongoose schemas centrally in
`src/database/mongoose/mongoose.module.ts` (not per-module), and all
feature modules in `src/app.module.ts`. Two small edits:

### 1. `src/database/mongoose/mongoose.module.ts`

Add the import near the other schema imports:

```ts
import { TeamMember, TeamMemberSchema } from '../schemas/team-member.schema';
```

Add it to the `MongooseModule.forFeature([...])` array:

```ts
{ name: TeamMember.name, schema: TeamMemberSchema },
```

### 2. `src/app.module.ts`

Add the import:

```ts
import { TeamModule } from './modules/team/team.module';
```

Add it to the `imports: [...]` array (anywhere alongside the other feature
modules, e.g. next to `ZoomMeetingsModule`):

```ts
TeamModule,
```

That's the whole integration — no config changes needed, since it reuses
your existing `auth.bcryptRounds` and `mail.*` config keys.

## API surface

All routes are under `/api/v1/team` and guarded by your existing
`PlatformAdminGuard` (same guard already used for the Zoom OAuth admin
routes) — only accounts with `isPlatformAdmin: true` can reach them.

| Method | Path                        | Purpose                                  |
|--------|-----------------------------|-------------------------------------------|
| POST   | `/team`                     | Invite a new team member                  |
| GET    | `/team`                     | List (paginated, search/status/role filter) |
| GET    | `/team/:id`                 | Get one team member                        |
| PATCH  | `/team/:id`                 | Update permissions / role / status         |
| POST   | `/team/:id/resend-invite`   | Re-issue a temp password + resend email    |
| DELETE | `/team/:id`                 | Remove a team member                       |

### Create request body

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "permissions": ["Dashborad", "Organization", "Roles & Permissions"],
  "role": "SUB_ADMIN"
}
```

`role` is optional and defaults to `SUB_ADMIN`. See "Role hierarchy" below
for who is allowed to set it to what.

### Update request body (all fields optional)

```json
{
  "permissions": ["Dashborad", "All Access"],
  "status": "SUSPENDED",
  "role": "ADMIN"
}
```

## Role hierarchy — the "admin invites → sub-admin" behavior

Your codebase didn't previously have a concept of platform-staff roles
(only the `isPlatformAdmin` boolean on `users`, plus each user's
org-scoped `UserRole`). To implement "if an admin creates an invite it
should come out as a sub-admin, and maybe there should be two kinds of
admin," I introduced a 3-tier `TeamRole`: `SUPER_ADMIN > ADMIN >
SUB_ADMIN`, stored on a new, separate `team_members` collection (kept
separate from your customer-facing `users` collection on purpose).

Business rules enforced in `TeamService`:

- **`SUPER_ADMIN`** can invite/manage `SUPER_ADMIN`, `ADMIN`, or
  `SUB_ADMIN`.
- **`ADMIN`** can only invite/manage `SUB_ADMIN` accounts — requesting
  `role: "ADMIN"` or `"SUPER_ADMIN"` is rejected with a 403.
- **`SUB_ADMIN`** cannot invite or manage anyone.
- Nobody can manage their own team record through this endpoint (self
  demotion/removal is blocked).
- The last remaining active `SUPER_ADMIN` can't be demoted, suspended, or
  deleted, so you can never lock yourself out of the team panel.
- Since a platform admin's own **team role** is resolved by looking up a
  `team_members` row matching their login email, the very first platform
  admin (one who predates this feature and has no `team_members` row yet)
  is treated as `SUPER_ADMIN` by default — so someone can always bootstrap
  the team. Once that person is explicitly added as a team member with an
  assigned role, that role takes over.

**Worth double-checking with you:** this hierarchy is my best interpretation
of "maybe there is two user admin" — if you actually want something simpler
(e.g. everyone platform-admin-flagged can manage everyone, no tiers), the
guard logic is all contained in `TeamService.assertCanManage` /
`GRANTABLE_ROLES`, so it's a small, isolated change.

## What's intentionally out of scope

- **Login for invited team members.** This module creates accounts with a
  hashed temp password in a new `team_members` collection, but your
  current `JwtStrategy` / `AuthService` only authenticates against the
  `users` collection. Signing in as a team member would need either (a) a
  parallel login endpoint for `team_members`, or (b) merging team members
  into `users` with `isPlatformAdmin: true`. I kept them separate to match
  your reference implementation's `Team` model, but this is the next piece
  you'll need if invited admins should actually be able to log in with
  their emailed temp password today.
- The `TeamPermission` enum values are kept **verbatim** from what you
  gave me, including the apparent typos (`"Dashborad"`, `"Meeting
  Calender"`, `"opertional diagonistic"`). If those aren't intentional,
  fix them in `team-permission.enum.ts` before anything else in your
  frontend starts depending on the literal strings.
