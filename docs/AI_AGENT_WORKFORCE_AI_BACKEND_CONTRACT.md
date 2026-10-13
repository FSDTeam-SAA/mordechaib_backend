# AI Agent Workforce — AI Backend Contract

## Purpose

The Main Backend now owns:

- organization-specific agent activation and approval policy;
- configured per-agent concurrency limits;
- persisted Main Backend activity metrics;
- proposal and task outcome aggregation;
- tenant-scoped workforce dashboard APIs.

The Main Backend must not infer AI queue depth, active retry state, specialist
delegation, or workflow topology. The AI Backend must publish those facts.

## 1. Policy supplied by the Main Backend

Every `POST /api/v1/ai/jobs/analyze-source` request includes this object at
`context.agentPolicy`. `POST /api/v1/ai/briefings/generate` includes the same
object at top-level `agentPolicy` and excludes explicitly disabled agents from
its `agents` array:

```json
{
  "defaults": {
    "enabled": true,
    "approvalRequired": true,
    "concurrencyLimit": null
  },
  "overrides": [
    {
      "agentId": "66f000000000000000000001",
      "enabled": false,
      "approvalRequired": true,
      "concurrencyLimit": 2
    }
  ]
}
```

Rules:

1. An override takes precedence over `defaults`.
2. The AI Backend must not select, run, or delegate to an agent whose effective
   `enabled` value is `false`.
3. A non-null `concurrencyLimit` is the maximum number of concurrent runs for
   the `(organizationId, agentId)` pair.
4. `approvalRequired` controls whether an action can be eligible for automatic
   execution. Existing Main Backend approval validation remains authoritative.
5. Unknown agent IDs must never be substituted. Agent IDs come from the Main
   Backend agent catalog.

The Main Backend also rejects an analysis response that attributes an assistant
message or action proposal to an explicitly disabled agent. This is a safety
boundary, not a replacement for AI-side scheduling.

## 2. Required run event contract

The AI Backend should send signed, idempotent run events to a future Main
Backend ingestion endpoint. Until that endpoint is released, the AI team should
implement and test the payload contract below without calling a guessed route.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01J...",
  "eventType": "AGENT_RUN_STARTED",
  "occurredAt": "2026-10-13T06:00:00.000Z",
  "organizationId": "6ab750484438958c8b717d1e",
  "workflowId": "wf_01J...",
  "runId": "run_01J...",
  "rootRunId": "run_01J...",
  "parentRunId": null,
  "agent": {
    "id": "66f000000000000000000001",
    "name": "Laura",
    "type": "CHIEF_OF_STAFF"
  },
  "orchestratorAgentId": "66f000000000000000000001",
  "delegatedByAgentId": null,
  "operationType": "SOURCE_ANALYSIS",
  "stepKey": "analyze-source",
  "source": {
    "type": "USER_MESSAGE",
    "id": "6acc73f1c89621797405eb83"
  },
  "attempt": 1,
  "queue": {
    "queuedAt": "2026-10-13T05:59:58.000Z",
    "startedAt": "2026-10-13T06:00:00.000Z"
  },
  "metadata": {}
}
```

Supported event types:

- `AGENT_RUN_QUEUED`
- `AGENT_RUN_STARTED`
- `AGENT_RUN_SUCCEEDED`
- `AGENT_RUN_FAILED`
- `AGENT_RUN_RETRY_SCHEDULED`
- `AGENT_RUN_CANCELLED`

Terminal events must add:

```json
{
  "completedAt": "2026-10-13T06:00:04.250Z",
  "processingTimeMs": 4250,
  "failure": null
}
```

Failure/retry events must use a bounded failure object:

```json
{
  "failure": {
    "code": "MODEL_TIMEOUT",
    "message": "Model request exceeded the configured timeout",
    "retryable": true
  },
  "nextAttemptAt": "2026-10-13T06:01:00.000Z"
}
```

## 3. Queue snapshot contract

Run events are the durable audit trail. For reconciliation after a worker or
webhook outage, the AI Backend also needs a snapshot endpoint:

```http
GET /api/v1/ai/internal/organizations/{organizationId}/agent-capacity
```

Expected response:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-10-13T06:05:00.000Z",
  "organizationId": "6ab750484438958c8b717d1e",
  "agents": [
    {
      "agentId": "66f000000000000000000001",
      "queuedJobs": 3,
      "runningJobs": 2,
      "retryingJobs": 1,
      "oldestQueuedAt": "2026-10-13T06:03:00.000Z"
    }
  ]
}
```

Counts must be scoped by both `organizationId` and `agentId`. Global worker
queue counts cannot be used for tenant dashboards.

## 4. Orchestration requirements

Every specialist delegation must have its own `runId`. The edge is represented
by `parentRunId` and `delegatedByAgentId`. Reusing the parent run ID for all
specialists makes the orchestration graph and per-agent analytics impossible.

Required invariants:

- `eventId` is globally unique and events are safe to replay.
- `runId` is stable across every event for one attempt lifecycle.
- `workflowId` is stable across the complete multi-agent workflow.
- `organizationId` is never inferred from client-provided metadata.
- timestamps are ISO-8601 UTC values.
- the AI Backend enforces the effective concurrency limit atomically.
- a retry increments `attempt` and emits `AGENT_RUN_RETRY_SCHEDULED`.

## 5. Still intentionally unavailable

These metrics require separate product definitions and must not be invented by
the AI Backend:

- compliance score and risk weighting;
- efficiency score;
- revenue attribution amount and attribution model;
- cost savings and ROI.

The Main Backend will continue returning explicit `UNAVAILABLE` values until
the corresponding methodology and data lineage are approved.

## 6. Acceptance checklist

- Disabled agents never run and never appear in an analysis response.
- Two organizations can configure different limits for the same global agent.
- Queue counts are isolated by organization and agent.
- A parent Laura run and all specialist runs share one `workflowId`.
- Event replay does not duplicate a run or increment counters twice.
- A retry is distinguishable from a new job.
- Worker crashes can be reconciled from the capacity snapshot.
- No secret, prompt, transcript, or customer payload is placed in telemetry
  metadata.
