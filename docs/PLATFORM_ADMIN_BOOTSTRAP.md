# Platform Admin Bootstrap

On an empty database, public registration creates an `OWNER` and cannot manage
the global Agent catalog. Run this one-time command to create the first
platform `ADMIN` account.

Set these values in the current shell, not in source control:

```powershell
$env:PLATFORM_ADMIN_EMAIL = 'admin@example.com'
$env:PLATFORM_ADMIN_PASSWORD = 'use-a-strong-password'
$env:PLATFORM_ADMIN_FIRST_NAME = 'Noltra'
$env:PLATFORM_ADMIN_LAST_NAME = 'Admin'
corepack pnpm run bootstrap:platform-admin
```

The command creates a user with `role: ADMIN` and `isPlatformAdmin: true` in
the internal platform organization. It is idempotent: rerunning it with the
same platform-admin email makes no change. It never converts an existing
customer account into an admin account.
