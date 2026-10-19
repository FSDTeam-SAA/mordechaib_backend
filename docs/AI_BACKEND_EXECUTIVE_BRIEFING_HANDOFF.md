# AI Backend Executive Briefing Implementation Handoff

## Purpose

This document is the implementation contract between the Noltra Main Backend
and the AI Backend for Chief of Staff Executive Briefings. The AI team can use
it as the source of truth for implementation, integration tests, and rollout.

The Main Backend already owns:

- authentication and tenant isolation;
- requester authorization and permission scoping;
- briefing-period calculation and timezone handling;
- collection of Task, Meeting, CRM, customer, support, agent, ROI, and other
  authorized facts;
- queueing, retry orchestration, response validation, and persistence;
- frontend polling and read APIs.

The AI Backend owns only the transformation of the supplied fact envelope into
the strict UI-ready briefing response described below. It must not fetch data
from Main Backend databases, call guessed Main Backend callbacks, or invent
missing business data.

## Current production mismatch

The currently deployed AI service exposes an older endpoint:

```http
POST /api/v1/ai/chief-of-staff/briefings
```

That endpoint accepts a smaller `DAILY | TEAM_CHALLENGES | WEEKLY` request,
returns a `{ briefing_id, backend_result }` wrapper, and currently attempts to
call the nonexistent Main Backend route `/api/v1/agent-runs/events`. It is not
compatible with the current Main Backend.

The AI team must implement the canonical endpoint in this document. The old
endpoint may be removed or retained only as a deprecated alias that internally
delegates to the canonical implementation. It must not remain a separate
contract.

## 1. Canonical endpoint

```http
POST /api/v1/ai/briefings/generate
Content-Type: application/json
x-ai-actions-secret: <shared secret>
```

The full URL is:

```text
{AI_SERVICE_URL}/api/v1/ai/briefings/generate
```

Requirements:

- authenticate `x-ai-actions-secret` against the configured shared secret;
- accept and return JSON;
- return the briefing object directly, without `{ success, data }`,
  `{ backend_result }`, or any other wrapper;
- complete within 60 seconds or return an appropriate retryable HTTP error;
- never log the shared secret or the complete fact payload;
- never call `/api/v1/agent-runs/events` or another guessed callback route.

## 2. Request contract

The request is generated and authorized by the Main Backend.

```ts
type ExecutiveBriefingRequest = {
  schemaVersion: "1.0";
  jobId: string;
  idempotencyKey: string;
  organizationId: string;
  briefingType: "TODAY" | "TEAM_CHALLENGES" | "WEEKLY_REVIEW";
  period: {
    start: string;    // ISO-8601 instant
    end: string;      // ISO-8601 instant; exclusive boundary
    timezone: string; // IANA timezone, for example Asia/Dhaka
  };
  requester: {
    userId: string;
    name: string;
    language: string;
    scopeHash: string;
  };
  organization: {
    name: string;
    industry?: string;
  };
  agents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
  agentPolicy: {
    defaults: {
      enabled: boolean;
      approvalRequired: boolean;
      concurrencyLimit: null;
    };
    overrides: Array<{
      agentId: string;
      enabled: boolean;
      approvalRequired: boolean;
      concurrencyLimit: number | null;
    }>;
  };
  facts: ExecutiveBriefingFacts;
  generatedAt: string; // ISO-8601 instant
};
```

Do not rename types:

```text
TODAY
TEAM_CHALLENGES
WEEKLY_REVIEW
```

In particular, do not translate them to the legacy values `DAILY` or
`WEEKLY` in this canonical API.

### Fact groups

The `facts` object always contains these groups:

```ts
type ExecutiveBriefingFacts = {
  tasks: FactGroup;
  meetings: FactGroup;
  actionProposals: FactGroup;
  sourceAnalyses: FactGroup;
  agentActivity: FactGroup;
  sales: FactGroup;
  customers: FactGroup;
  support: FactGroup;
  finance: FactGroup;
  vendors: FactGroup;
  marketing: FactGroup;
  productDesign: FactGroup;
  roi: FactGroup;
  aiQuality: FactGroup;
  strategicNotes: FactGroup;
};

type FactGroup = {
  availability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  items: Fact[];
};

type Fact = {
  id: string;
  sourceType: string;
  sourceId: string;
  capturedAt: string;
  data: Record<string, unknown>;
};
```

Fact IDs are unique across the complete request, not merely inside one group.
The `data` object is authoritative source data; the AI Backend may summarize or
derive display text from it but may not create unsupported facts.

### Availability semantics

- `AVAILABLE`: the supplied items are authoritative for the stated scope.
- `PARTIAL`: some authorized data exists, but it is not complete enough for an
  organization-wide claim.
- `UNAVAILABLE`: no authorized data exists for this domain. This is not zero.

Missing domains must not make the request fail. The corresponding response
section must remain explicitly unavailable and contain no items.

## 3. Response contract

Return a raw JSON object with this structure:

```ts
type ExecutiveBriefingResponse = {
  jobId: string;
  briefingType: "TODAY" | "TEAM_CHALLENGES" | "WEEKLY_REVIEW";
  period: {
    start: string;
    end: string;
    timezone: string;
  };
  summary: string;
  trajectory: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "UNKNOWN";
  headlineMetrics: HeadlineMetric[];
  sections: BriefingSection[];
  sourceRefs: SourceReference[];
  confidence: number; // inclusive range 0..1
};
```

The following fields must echo the request exactly:

- `jobId`;
- `briefingType`;
- `period.start`;
- `period.end`;
- `period.timezone`.

Do not return snake_case aliases such as `briefing_id`. Do not wrap the object
inside `backend_result`.

### Headline metrics

```ts
type HeadlineMetric = {
  key: string; // max 128 characters
  label: string; // max 300 characters
  value: string | number;
  unit:
    | "COUNT"
    | "PERCENT"
    | "CURRENCY_USD"
    | "MINUTES"
    | "HOURS"
    | "SCORE"
    | "TEXT";
  direction: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sourceRefs: string[];
};
```

Rules:

- at most 50 headline metrics;
- every metric must reference facts whose group is `AVAILABLE`;
- every referenced fact must also exist in the response-level `sourceRefs`;
- a `COUNT` metric with value `0` is not allowed as a headline metric;
- do not present missing data as `0`, `0%`, or `$0`.

### Sections

```ts
type BriefingSection = {
  id: string;
  title: string; // max 300 characters
  kind:
    | "TEXT"
    | "LIST"
    | "AGENT_CARDS"
    | "DECISION_CARDS"
    | "METRIC_GRID"
    | "PROGRESS"
    | "DONUT";
  availability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  summary?: string; // max 4,000 characters
  items: BriefingSectionItem[];
};
```

Every response must return every required section for its briefing type in the
exact order listed in section 4. An unavailable section is still required:

```json
{
  "id": "financial_pulse",
  "title": "Financial Pulse",
  "kind": "TEXT",
  "availability": "UNAVAILABLE",
  "summary": "Finance data was not supplied.",
  "items": []
}
```

An `UNAVAILABLE` section must always have an empty `items` array.

### Section items

```ts
type BriefingSectionItem = {
  id: string; // max 200 characters
  label: string; // max 500 characters
  detail?: string; // max 5,000 characters
  status?: string; // display-only, max 100 characters
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sourceRefs: string[];
  value?: string | number;
  unit?:
    | "COUNT"
    | "PERCENT"
    | "CURRENCY_USD"
    | "MINUTES"
    | "HOURS"
    | "SCORE"
    | "TEXT";
  recommendationOnly: boolean;
  proposalId?: string;
  proposalAction?: "APPROVE" | "RETRY";
};
```

Rules:

- at most 100 items per section;
- `sourceRefs` must contain between 1 and 100 valid fact IDs;
- `value` and `unit` must either both exist or both be omitted;
- `status` is display text and must not imply that an external action ran;
- every stable item ID should remain unchanged during an idempotent replay.

### Decision and proposal rules

The Main Backend remains the only authority for approval and execution.

For a normal recommendation:

```json
{
  "recommendationOnly": true,
  "sourceRefs": ["task-fact-1"]
}
```

A recommendation-only item must not include `proposalAction`. It may reference
a `proposalId` only when the supplied proposal has status
`NEEDS_CLARIFICATION` and the corresponding proposal fact is cited.

For an executable decision:

- `recommendationOnly` must be `false`;
- `proposalId` must exactly match a real Main Backend proposal supplied in
  `facts.actionProposals`;
- the corresponding proposal fact must be cited in `sourceRefs`;
- a `PENDING` proposal permits only `proposalAction: "APPROVE"`;
- a `FAILED` proposal permits only `proposalAction: "RETRY"`;
- no other proposal status is executable from a briefing.

The current Main Backend briefing validator does not accept `REJECT` as a
briefing `proposalAction`. Rejection remains a separate explicit frontend/Main
Backend proposal operation.

### Source-reference registry

```ts
type SourceReference = {
  ref: string; // exact Fact.id
  sourceType: string; // exact Fact.sourceType
  sourceId: string; // exact Fact.sourceId
  capturedAt: string; // exact Fact.capturedAt
};
```

Rules:

- at most 500 response-level references;
- `ref` values must be unique;
- every reference must match one supplied fact exactly;
- every fact ID cited by a metric or section item must be included here;
- do not return references that were not supplied by the Main Backend.

## 4. Required section IDs and order

### `TODAY`

```text
primary_focus
overnight_movements
ceo_action_items
pipeline_revenue
client_health
operational_status
financial_pulse
vendor_accountability
marketing_growth
design_status
ceo_notes
```

Exactly 11 sections are required.

### `TEAM_CHALLENGES`

```text
completed_milestones
ceo_action_items
next_day_decisions
key_risks
strategic_blockers
financial_movements
operational_metrics
vendor_performance
priority_alignment
team_accountability
escalations
ceo_notes
```

Exactly 12 sections are required.

### `WEEKLY_REVIEW`

```text
executive_summary
roi_efficiency
sales_revenue
client_health
delivery_milestones
marketing_growth
product_creative
ai_system_health
financial_movements
vendor_performance
strategic_shift
ceo_notes
```

Exactly 12 sections are required.

## 5. Grounding and safety rules

1. Use only facts supplied in the request.
2. Never invent a metric, amount, percentage, customer, vendor, deadline,
   proposal, task, meeting, or provider operation.
3. Every factual section item and every metric must cite its supporting facts.
4. Preserve the supplied `[period.start, period.end)` boundary and timezone.
5. `UNAVAILABLE` never means zero.
6. `PARTIAL` data must not become an organization-wide claim.
7. Agent catalog status such as `ACTIVE` means assignable, not healthy, online,
   successful, or recently active.
8. Platform subscription revenue is not the customer's business revenue.
9. Source-level sentiment or health cannot become a customer-wide trend unless
   the supplied facts contain the required linked history.
10. AI Backend must not claim it created, approved, executed, sent, or updated
    any external resource.
11. Disabled agents must not be selected or represented as active workers.
12. Never expose prompts, secrets, or unrelated tenant data in output or logs.

## 6. Idempotency

Use durable/shared storage suitable for multiple AI Backend replicas.
Process-local memory alone is insufficient.

Required behavior:

- same `idempotencyKey` and identical canonical input: return the same logical
  response with stable section-item IDs;
- same `idempotencyKey` and different canonical input: return HTTP `409`;
- concurrent duplicate requests must not produce divergent responses;
- include requester identity and `requester.scopeHash` in the canonical input
  fingerprint;
- include briefing type, period, schema version, fact contents, and fact
  availability in the fingerprint.

## 7. HTTP error contract

Return a JSON error body with a bounded, non-sensitive message.

| HTTP | Meaning | Main Backend behavior |
| --- | --- | --- |
| `200` | Valid raw briefing response | Validate and persist as `READY` |
| `400` | Invalid request or response contract | Terminal failure |
| `401` | Missing/invalid shared secret | Terminal failure |
| `409` | Idempotency key reused with different input | Terminal failure |
| `422` | Structurally valid request cannot be processed | Terminal failure |
| `408` | Processing timeout | Retryable |
| `429` | Rate limited | Retryable |
| `500+` | AI/model/orchestrator unavailable | Retryable |

Do not return `404` for the canonical route after deployment.

Missing optional business domains must not cause `422`. Return a valid partial
briefing with the affected sections marked `UNAVAILABLE` or `PARTIAL`.

## 8. Example request

This example is abbreviated only inside `data`; real requests contain the
actual authorized facts.

```json
{
  "schemaVersion": "1.0",
  "jobId": "briefing-org-scope-today-2026-10-16-input",
  "idempotencyKey": "briefing-org-scope-today-2026-10-16-input-fullhash",
  "organizationId": "6ab750484438958c8b717d1e",
  "briefingType": "TODAY",
  "period": {
    "start": "2026-10-15T18:00:00.000Z",
    "end": "2026-10-16T18:00:00.000Z",
    "timezone": "Asia/Dhaka"
  },
  "requester": {
    "userId": "6ab750494438958c8b717d20",
    "name": "Example Owner",
    "language": "en",
    "scopeHash": "requester-permission-scope-hash"
  },
  "organization": {
    "name": "Example Organization",
    "industry": "Software"
  },
  "agents": [
    {
      "id": "agent-id",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF",
      "status": "ACTIVE"
    }
  ],
  "agentPolicy": {
    "defaults": {
      "enabled": true,
      "approvalRequired": true,
      "concurrencyLimit": null
    },
    "overrides": []
  },
  "facts": {
    "tasks": {
      "availability": "AVAILABLE",
      "items": [
        {
          "id": "task-fact-1",
          "sourceType": "TASK",
          "sourceId": "task-record-id",
          "capturedAt": "2026-10-16T04:00:00.000Z",
          "data": {
            "title": "Review enterprise renewal",
            "status": "TO_DO",
            "priority": "HIGH"
          }
        }
      ]
    },
    "meetings": { "availability": "AVAILABLE", "items": [] },
    "actionProposals": { "availability": "AVAILABLE", "items": [] },
    "sourceAnalyses": { "availability": "PARTIAL", "items": [] },
    "agentActivity": { "availability": "AVAILABLE", "items": [] },
    "sales": { "availability": "UNAVAILABLE", "items": [] },
    "customers": { "availability": "UNAVAILABLE", "items": [] },
    "support": { "availability": "UNAVAILABLE", "items": [] },
    "finance": { "availability": "UNAVAILABLE", "items": [] },
    "vendors": { "availability": "UNAVAILABLE", "items": [] },
    "marketing": { "availability": "UNAVAILABLE", "items": [] },
    "productDesign": { "availability": "UNAVAILABLE", "items": [] },
    "roi": { "availability": "UNAVAILABLE", "items": [] },
    "aiQuality": { "availability": "UNAVAILABLE", "items": [] },
    "strategicNotes": { "availability": "UNAVAILABLE", "items": [] }
  },
  "generatedAt": "2026-10-16T06:00:00.000Z"
}
```

## 9. Minimal valid response pattern

The following pattern shows the required shape. A real response must include
all 11 `TODAY` sections in the documented order.

```json
{
  "jobId": "briefing-org-scope-today-2026-10-16-input",
  "briefingType": "TODAY",
  "period": {
    "start": "2026-10-15T18:00:00.000Z",
    "end": "2026-10-16T18:00:00.000Z",
    "timezone": "Asia/Dhaka"
  },
  "summary": "One high-priority task requires review. Revenue data was not supplied.",
  "trajectory": "UNKNOWN",
  "headlineMetrics": [],
  "sections": [
    {
      "id": "primary_focus",
      "title": "Today's Primary Focus",
      "kind": "LIST",
      "availability": "AVAILABLE",
      "summary": "Review the enterprise renewal.",
      "items": [
        {
          "id": "primary-focus-task-fact-1",
          "label": "Review enterprise renewal",
          "status": "TO_DO",
          "severity": "HIGH",
          "sourceRefs": ["task-fact-1"],
          "recommendationOnly": true
        }
      ]
    },
    {
      "id": "overnight_movements",
      "title": "Overnight Movements",
      "kind": "LIST",
      "availability": "UNAVAILABLE",
      "summary": "No authorized overnight movement data was supplied.",
      "items": []
    }
  ],
  "sourceRefs": [
    {
      "ref": "task-fact-1",
      "sourceType": "TASK",
      "sourceId": "task-record-id",
      "capturedAt": "2026-10-16T04:00:00.000Z"
    }
  ],
  "confidence": 0.9
}
```

The example intentionally omits the remaining sections for readability and is
not itself accepted by the Main Backend validator.

## 10. AI Backend implementation structure

Use one reusable pipeline rather than separate duplicated implementations for
the three briefing types:

```text
authenticate request
  -> validate common request schema
  -> enforce durable idempotency
  -> select ordered section definition by briefingType
  -> build sections only from supplied facts
  -> build response-level source registry
  -> validate grounding and decision invariants
  -> return raw response
```

Recommended components:

- `ExecutiveBriefingRequest` schema/model;
- `ExecutiveBriefingResponse` schema/model;
- one section-definition registry keyed by briefing type;
- one fact index keyed by `Fact.id`;
- one source-reference builder shared by metrics and sections;
- one proposal-decision policy validator;
- one durable idempotency repository;
- one final response validator executed before HTTP `200`.

Do not maintain three copied route handlers or three unrelated response models.

## 11. Acceptance tests required before deployment

### Route and authentication

- canonical endpoint returns something other than `404`;
- missing or incorrect shared secret returns `401`;
- successful response is raw JSON with no wrapper;
- no Main Backend callback is attempted.

### Contract

- all three briefing types accept the same common fact envelope;
- echoed `jobId`, type, and period exactly match the request;
- every required section exists once and in the correct order;
- unavailable sections contain zero items;
- unknown fact references are rejected before returning `200`;
- numeric and factual outputs contain valid references;
- invalid proposal IDs or actions are rejected;
- a `PENDING` proposal can produce `APPROVE`;
- a `FAILED` proposal can produce `RETRY`;
- no other proposal state produces an executable decision.

### Data integrity

- unavailable finance/CRM/support data is not converted to zero;
- partial customer data is not generalized to all customers;
- platform subscription revenue is not reported as customer revenue;
- agent catalog status is not reported as runtime health;
- no unsupported metric or external execution claim is generated.

### Idempotency and reliability

- identical key and input replay the same logical response;
- identical key with changed input returns `409`;
- concurrent duplicates remain deterministic;
- `429` and dependency `5xx` conditions return bounded JSON errors;
- processing respects the 60-second Main Backend timeout budget.

## 12. End-to-end verification after AI deployment

1. Confirm the AI route appears in AI Backend OpenAPI:

```text
POST /api/v1/ai/briefings/generate
```

2. Generate through Main Backend:

```http
POST /api/v1/chief-of-staff/briefings/TODAY/generate
Authorization: Bearer <owner-or-admin-token>
Content-Type: application/json

{
  "asOf": "2026-10-16T06:00:00.000Z"
}
```

3. The immediate Main Backend response should contain:

```json
{
  "briefingId": "<mongodb-object-id>",
  "status": "QUEUED",
  "pollAfterMs": 2000
}
```

4. Poll the returned ID:

```http
GET /api/v1/chief-of-staff/briefings/id/<briefingId>
Authorization: Bearer <owner-or-admin-token>
```

Expected state sequence:

```text
QUEUED -> GENERATING -> READY
```

5. Verify that the `READY` response contains `content.summary`,
   `content.headlineMetrics`, every ordered section, `content.sourceRefs`, and
   `content.confidence`.

6. Repeat for:

```text
TEAM_CHALLENGES
WEEKLY_REVIEW
```

The Main Backend must not be changed to consume the legacy route or legacy
response wrapper. Successful completion means the canonical AI endpoint passes
the existing Main Backend validator unchanged.
