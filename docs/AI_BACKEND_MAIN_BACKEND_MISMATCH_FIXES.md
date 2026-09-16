# AI Backend Mismatch Fix Handoff

## Purpose

This document contains only the remaining changes required in the AI Backend
to match the current Main Backend contract. The existing analysis, proposal,
approval, and execution flow does not need to be redesigned.

## 1. Enable agent catalog bootstrap

The Main Backend catalog endpoint is now available:

```http
GET {MAIN_BACKEND_URL}/api/v1/ai-internal/agents?limit=100&cursor=<opaque-cursor>
x-ai-actions-secret: <shared-secret>
```

Enable startup and periodic reconciliation in the AI Backend:

```dotenv
AGENT_CATALOG_AUTO_BOOTSTRAP=true
BACKEND_API_URL=https://<main-backend-host>
MAIN_BACKEND_AGENT_CATALOG_PATH=/api/v1/ai-internal/agents
```

`AI_ACTIONS_SHARED_SECRET` in the AI Backend and
`AI_SERVICE_SHARED_SECRET` in the Main Backend may have different variable
names, but their values must be identical.

The Main Backend response uses its normal envelope:

```json
{
  "success": true,
  "data": {
    "items": [],
    "nextCursor": null
  }
}
```

The AI Backend must read `data.items` and `data.nextCursor`, follow every page
until `nextCursor` is `null`, and retain disabled agents without assigning new
work to them.

Existing agents may not have generated an incremental event. Therefore,
bootstrap must be completed before the AI Backend processes analysis jobs. If
startup reconciliation is still running or failed, return a retryable `503`
instead of returning a successful empty `actions` array. An empty array is
valid only when the global catalog genuinely has no suitable active agent or
no action was detected.

## 2. Preserve the exact action ID during refinement

The Main Backend refinement request contains `proposal.proposalId`, but the
current proposal response may not contain a separate `proposal.actionId`.

```text
proposalId = requestId + ":" + actionId
```

Example:

```json
{
  "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "proposal": {
    "proposalId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2:source-zoom_meeting-66cc9bdfa847ea856c7b41d2-meeting-002",
    "actionType": "SCHEDULE_MEETING"
  }
}
```

The AI Backend must extract the exact `actionId` from `proposal.proposalId` and
return it unchanged:

```json
{
  "action": {
    "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-meeting-002",
    "actionType": "SCHEDULE_MEETING"
  }
}
```

Do not reconstruct the ID using an assumed `001` sequence. That fails when a
source produces multiple tasks or meetings. If neither a valid `actionId` nor
a matching `proposalId` is available, reject the refinement request instead
of guessing.

The response must also preserve the original `actionType` and
`proposedByAgent` snapshot.

## 3. Correct timezone conversion

Use the following order when resolving a local date and time:

1. A timezone explicitly stated in the source or clarification answer.
2. `context.effectiveTimezone`.
3. `context.organization.timezone` only as a compatibility fallback.

`startsAt` must be an absolute ISO-8601 datetime. For example:

```text
Input:  September 15, 2026 at 3:00 PM Asia/Dhaka
UTC:    2026-09-15T09:00:00.000Z
Offset: 2026-09-15T15:00:00+06:00
```

`2026-09-15T15:00:00.000Z` is not 3:00 PM in Asia/Dhaka and must not be
returned for that input. If the date, time, or timezone cannot be resolved
unambiguously, return `clarificationQuestions` instead of guessing.

## 4. Use Main Backend agent IDs

Every new action must use the MongoDB ObjectId received from the synchronized
catalog:

```json
{
  "proposedByAgent": {
    "id": "66cc9bdfa847ea856c7b41a1",
    "name": "Layla",
    "type": "OPERATIONS"
  }
}
```

Do not return semantic identifiers such as `operations-agent` as `id`.
Different actions may use different global active agents. Refinement must echo
the proposal's original agent snapshot even if that agent was later disabled.

Update outdated API examples that still show semantic agent IDs.

## 5. Catalog durability

A local JSON catalog is acceptable only for a single-instance MVP when the
file survives restarts and bootstrap runs successfully at every startup. For
multi-instance or ephemeral deployments, use a shared durable database or
Redis store so all instances route with the same catalog version.

## Acceptance checks

The AI Backend is compatible when all of these pass:

- Bootstrap reads `data.items`, follows pagination, and loads existing active
  agents.
- A cold start does not silently return empty actions before bootstrap
  completes.
- Agent upsert, disable, and activate events remain idempotent by version.
- Two actions of the same type retain distinct IDs through clarification, for
  example `task-001` and `task-002`.
- Refinement preserves the original action type and agent snapshot.
- `3:00 PM Asia/Dhaka` resolves to `09:00Z` for the same date.
- Ambiguous meeting date/time returns clarification questions.
- `analyze-source` returns actions containing catalog-backed MongoDB agent IDs.
