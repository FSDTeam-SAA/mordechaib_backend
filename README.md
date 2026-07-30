# Noltra Backend Clean Starter — MongoDB + Mongoose

This is a simple, maintainable NestJS backend structure for **Noltra AI** using **MongoDB and Mongoose**.

It avoids heavy DDD folders for every module and uses a practical structure that is easier for a mid-level backend engineer to maintain.

## Main idea

```text
src/
├── common/        # shared guards, decorators, helpers, filters
├── config/        # env and app config
├── database/      # MongoDB connection + Mongoose schemas
├── modules/       # feature modules
└── main.ts
```

Each feature module uses a simple pattern:

```text
module-name/
├── module-name.module.ts
├── module-name.controller.ts
├── module-name.service.ts
├── module-name.repository.ts
├── dto/
├── enums/
└── providers/     # only if the module connects external services
```

## Why this structure is easier

- Easy to add/remove a module.
- Controllers stay thin.
- Services handle business logic.
- Repositories handle MongoDB/Mongoose queries.
- External API clients stay inside `providers/`.
- Common reusable code stays in `common/`.
- No unnecessary domain/application/infrastructure folders for every feature.

## Database setup

MongoDB connection is handled in:

```text
src/database/mongoose/mongoose.module.ts
```

Reusable schemas are stored in:

```text
src/database/schemas/
```

Repositories use Mongoose models through `@InjectModel()`.

## Install

```bash
pnpm install
cp .env.example .env
pnpm run start:dev
```

## MongoDB

Set `MONGO_URI` in `.env` to a running local or hosted MongoDB instance. The default
connection string is:

```text
MONGO_URI=mongodb://localhost:27017/noltra
```

The API starts at `http://localhost:5000/api/v1`, and Swagger UI is available at
`http://localhost:5000/api/docs`.

## Authentication

Authentication uses short-lived JWT access tokens and rotating opaque refresh tokens.
Send access tokens as `Authorization: Bearer <token>`. Refresh, reset, and verification
tokens are stored as SHA-256 hashes and active sessions can be revoked immediately.

Public endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/package-inquiries`

Authenticated endpoints:

- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `PATCH /api/v1/auth/change-password`
- `POST /api/v1/auth/resend-verification`

When SMTP is configured, verification and password-reset links are sent by email. During
local development, `.env` can set `AUTH_EXPOSE_DEVELOPMENT_TOKENS=true` to include these
one-time tokens in API responses. Never enable that option in production.

## Business onboarding

The authenticated user's organization is derived from the access token; clients cannot
select another tenant by changing a header.

Complete onboarding in this order:

1. `PATCH /api/v1/organizations/onboarding/company-details`
2. `PATCH /api/v1/organizations/onboarding/industry`
3. `PATCH /api/v1/organizations/onboarding/business-size`

Use `GET /api/v1/organizations` to retrieve the current business profile and onboarding
status. The removed social-links/business-tools screen is not part of this flow.

## Quality checks

```bash
pnpm run build
pnpm run lint
pnpm run format:check
```

## Recommended build order for Noltra

1. Auth + Organizations + Users
2. Twilio number/call setup
3. Calls + Recordings + Transcription
4. AI summary + Approvals
5. CRM: HubSpot + Salesforce
6. Calendar: Google + Outlook
7. Usage + Billing
8. Audit logs + Admin

## Important rule

AI should generate suggested actions only. External actions like CRM update or calendar creation should go through the approval module first.
