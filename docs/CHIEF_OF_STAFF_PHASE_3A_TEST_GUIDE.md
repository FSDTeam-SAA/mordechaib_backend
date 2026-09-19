# Chief of Staff Phase 3A API Test Guide

## What Phase 3A adds

- persisted telemetry for AI source-analysis and Executive Briefing jobs;
- organization-scoped agent activity and measured AI runtime-health reads;
- CEO strategic-note create, list, update, and soft-delete APIs;
- agent activity, AI runtime health, and active strategic notes in Executive
  Briefing facts sent to AI Backend.

All routes require an authenticated `OWNER` or `ADMIN`. Responses are wrapped
as `{ "success": true, "data": ... }` by the global response interceptor.

## Prerequisites

1. Start MongoDB and Redis.
2. Start Main Backend on `http://localhost:5000`.
3. For a successful briefing, AI Backend must implement
   `POST /api/v1/ai/briefings/generate` and Main Backend must have AI automation
   enabled. If AI Backend fails, Phase 3A should still record a failed activity.
4. Login with an owner/admin account and copy `data.accessToken`:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "owner@example.com",
  "password": "your-password",
  "rememberMe": false
}
```

Use this header on every request below:

```http
Authorization: Bearer <access-token>
```

## 1. Test strategic notes

Create a note:

```http
POST /api/v1/chief-of-staff/strategic-notes
Content-Type: application/json

{
  "content": "Prioritize enterprise renewals and vendor accountability.",
  "appliesTo": ["TODAY", "WEEKLY_REVIEW"],
  "validFrom": "2026-09-18T00:00:00.000Z",
  "validUntil": "2026-10-01T00:00:00.000Z"
}
```

Save `data.id` as `<note-id>`. List notes, optionally filtered to notes active
at a specific instant:

```http
GET /api/v1/chief-of-staff/strategic-notes?page=1&limit=20
GET /api/v1/chief-of-staff/strategic-notes?activeAt=2026-09-18T06:00:00.000Z
```

Update and delete the note:

```http
PATCH /api/v1/chief-of-staff/strategic-notes/<note-id>
Content-Type: application/json

{
  "content": "Prioritize enterprise renewals this week."
}
```

```http
DELETE /api/v1/chief-of-staff/strategic-notes/<note-id>
```

Delete is a soft delete. A deleted note must no longer appear in list results
or future briefing facts.

## 2. Generate telemetry through real background work

Queue a briefing for a period in which the test note is active:

```http
POST /api/v1/chief-of-staff/briefings/TODAY/generate
Content-Type: application/json

{
  "asOf": "2026-09-18T06:00:00.000Z"
}
```

Expected immediate response data includes:

```json
{
  "briefingId": "<briefing-id>",
  "status": "QUEUED",
  "pollAfterMs": 2000
}
```

Poll with the returned ID:

```http
GET /api/v1/chief-of-staff/briefings/id/<briefing-id>
```

Terminal status is `READY` or `FAILED`; the frontend should wait
`pollAfterMs` between calls and stop polling on either terminal status.

Generating or processing a normal chat/call/meeting source analysis also
creates a `SOURCE_ANALYSIS` activity through the existing workflow.

## 3. Read agent activity

```http
GET /api/v1/chief-of-staff/insights/agent-activity?from=2026-09-17T00:00:00.000Z&to=2026-09-19T00:00:00.000Z&limit=50
```

Verify that `data.items` contains `EXECUTIVE_BRIEFING` or `SOURCE_ANALYSIS`
records with `status`, `startedAt`, `completedAt`, `latencyMs`, `attempt`, and
source/job identifiers. A currently executing job may temporarily have
`STARTED` status.

## 4. Read measured AI runtime health

```http
GET /api/v1/chief-of-staff/insights/ai-health?from=2026-09-17T00:00:00.000Z&to=2026-09-19T00:00:00.000Z
```

Verify these measured fields:

```text
totalRuns
completedRuns
succeeded
failed
running
skipped
successRatePercent
averageLatencyMs
p95LatencyMs
operationCounts
```

With no completed runs, percentages and latency values are `null`; this is not
an error and must not be rendered as 0% accuracy.

## 5. Verify briefing integration

For a `READY` briefing, verify the rendered response contains grounded sections
based on activity/health/notes. For direct database or AI-request debugging,
the persisted briefing input must contain:

```text
facts.agentActivity.availability = AVAILABLE
facts.aiQuality.availability = AVAILABLE or PARTIAL
facts.strategicNotes.availability = AVAILABLE
```

Each item has `sourceType`, `sourceId`, and `capturedAt`. Runtime health is
explicitly a reliability metric and must not be described as model accuracy.

## Swagger

Open `http://localhost:5000/api/docs`, login through the Authentication group,
then test all routes under the `Chief of Staff` Swagger collection. Swagger
keeps the bearer token after a successful login.
