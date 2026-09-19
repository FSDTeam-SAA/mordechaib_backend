# AI Chief of Staff: Main Backend Implementation Specification

## Purpose and authority

This document defines the remaining Main Backend work required for the AI
Chief of Staff chat and Executive Briefings UI.

It is aligned with:

- the current Main Backend codebase;
- `CHIEF_OF_STAFF_UI_AI_BACKEND_GAP_SPEC.md`;
- the supplied Chief of Staff chat, Today's Briefing, Team Challenges, and
  Weekly Review designs;
- the current Task, Meeting, Call Intelligence, Agent, Message, and Calendar
  modules.

When an older document or example conflicts with this specification, use this
document for Main Backend implementation and the AI Backend gap specification
for the AI service contract.

This is a documentation contract only. It does not require database or
business-logic changes to existing Task, Meeting, Call Intelligence, or
proposal execution flows unless a section below explicitly identifies new
work.

## Readiness verdict

The Main Backend is partially ready, but it cannot yet support the complete UI.

| Capability | Current state | Required work |
| --- | --- | --- |
| Store and list user chat messages | Ready | Reuse current Message APIs |
| Submit a user message for background analysis | Ready | Preserve current queue flow |
| Create Task/Meeting proposals from AI actions | Ready | Preserve current proposal logic |
| Clarify, approve, reject, or retry proposals | Ready | Reuse Call Intelligence proposal routes |
| Persist and return an AI chat reply | Phase 1 implemented | `assistantMessage` is validated, stored idempotently, and exposed through the current message list |
| Build organization facts for chat | Phase 1 MVP implemented | Permission-aware Task, Meeting, Calendar, Proposal, and source-analysis facts are bounded and source-referenced |
| Read attachment contents | Partial | Plain text and CSV are extracted; other formats explicitly report unavailable unless secure download is enabled |
| Analyze call transcripts | Implemented but deployment-dependent | Enable and verify transcription configuration |
| Generate Executive Briefings | Phase 2 implemented | Briefing persistence, facts, queue, validation, polling, and public APIs are available |
| Customer Intelligence | Missing domain model | Add only when a real customer/account source exists |
| Finance, vendor, support, ROI | Missing or partial | Report `UNAVAILABLE` until authoritative modules exist |
| AI runtime health/activity | Phase 3A implemented | Source-analysis and briefing workers emit measured activity, latency, and outcome telemetry |
| CEO strategic notes | Phase 3A implemented | Organization-scoped CRUD plus active-note briefing facts are available |
| Email draft/send action | Not supported | Keep suggestion-only for MVP |

## Existing public routes to reuse

The Chief of Staff frontend should reuse existing domain routes where it needs
full records. Do not create duplicate CRUD APIs inside a Chief of Staff module.

```text
Messages / conversations    existing Messages routes
Tasks                       existing Tasks routes
Calendar events             existing Calendar routes
Meetings and calls          /api/v1/call-intelligence
Call or meeting details     /api/v1/call-intelligence/:sourceId/details?sourceType=<type>
Proposal list               /api/v1/call-intelligence/proposals
Proposal clarification      /api/v1/call-intelligence/proposals/:id/clarifications
Proposal command            /api/v1/call-intelligence/proposals/:id/action
Agents                      existing Agents routes
```

The Main Backend remains the source of truth for authentication,
authorization, organization isolation, proposal status, and action execution.
The browser must never call the AI Backend directly.

The older `action-center` and `/ai-actions/...` routes may remain temporarily
as compatibility aliases, but new Chief of Staff frontend work must use the
Call Intelligence routes above. Do not add a second frontend dependency on
those aliases.

## Gap 1: accept and validate `assistantMessage`

### Current behavior

`AiJobsProcessor` calls the AI Backend and ingests `actions`, but it does not
consume an AI chat reply. `AiAnalysisResult` currently treats only the action
and analysis portions as meaningful output.

### Required change

Extend the internal AI response type with this optional field:

```json
{
  "assistantMessage": {
    "responseId": "source-user_message-<message-id>:reply:v1",
    "content": "I prepared a meeting proposal. What time should it start?",
    "agent": {
      "id": "<active-agent-id>",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    },
    "runId": "optional-stable-ai-run-id"
  }
}
```

Runtime validation is required. TypeScript types alone are insufficient.

Validate all of the following before persistence:

- `assistantMessage` is accepted only for `source.type=USER_MESSAGE`;
- response `requestId` and `source` exactly match the request;
- `responseId` is present, non-empty, and no longer than 200 characters;
- `content` is non-empty and no longer than 20,000 characters;
- `agent` refers to a synchronized, currently active catalog agent;
- `runId`, when present, is a bounded string;
- `actions` is an array and only contains `CREATE_TASK` or
  `SCHEDULE_MEETING`;
- confidence and analysis number ranges remain valid;
- unsupported fields do not silently become executable behavior.

For non-user sources, ignore or reject `assistantMessage` according to the
chosen strict-validation policy. The preferred policy is to reject malformed
AI responses and retry the job instead of silently accepting a conflicting
contract.

## Gap 2: persist the assistant reply idempotently

### Existing storage support

The Message model and repository already support AI messages with:

- `senderType=AI`;
- `aiResponseId`;
- `sourceMessageId`;
- `agentId` and `agentName`;
- `agentRunId`;
- organization and conversation ownership.

`MessagesRepository.createAi()` exists, but current orchestration does not call
it.

### Required behavior

Add an idempotent service operation such as:

```text
createAiIdempotent(organizationId, conversationId, assistantMessage,
                   sourceMessageId) -> { message, created }
```

Required rules:

1. Use `organizationId + aiResponseId` as the replay boundary already
   represented by the schema/index.
2. A retry with the same `responseId` must return the existing message.
3. Increment conversation message count only when `created=true`.
4. Bind the AI message to the original user message through
   `sourceMessageId`.
5. Never persist a reply into a conversation outside the job organization.
6. Ingest valid proposals and persist the assistant reply before marking the
   source message completed.
7. If persistence fails, keep the job retryable; do not report successful
   completion.
8. The existing conversation message-list route must return the stored AI
   message, so no separate "AI reply" read route is needed.

The existing behavior that skips an older queued user message when a newer
message exists may remain for MVP. A later enhancement may introduce a formal
`SUPERSEDED` processing status instead of marking it completed.

## Gap 3: build permission-aware chat facts

### Current behavior

The USER_MESSAGE context already contains:

- the current message;
- recent conversation messages;
- attachment metadata and optional extracted content;
- pending action proposals;
- organization, requester, and effective timezone information.

It does not currently include a general view of Tasks, Meetings, Calendar,
CRM, finance, sales, or operational facts. Therefore, answers such as
"What is today's status?" cannot be grounded from the present payload.

### Required component

Add a Main Backend `ChatFactContextBuilder` or equivalent. It should gather
only facts the requester is authorized to see.

Minimum MVP categories:

```text
tasks
meetings
calendarEvents
actionProposals
sourceAnalyses
```

Every category must include an explicit availability state:

```json
{
  "availability": "AVAILABLE",
  "items": [
    {
      "id": "task-fact-1",
      "sourceType": "TASK",
      "sourceId": "<task-id>",
      "capturedAt": "2026-09-18T05:30:00.000Z",
      "data": {}
    }
  ]
}
```

Allowed availability values:

```text
AVAILABLE | PARTIAL | UNAVAILABLE
```

Rules:

- enforce organization and user permissions before facts enter the snapshot;
- bound item counts and text sizes;
- use stable fact IDs within an idempotent request;
- preserve source IDs and capture timestamps;
- never map missing data to zero;
- never expose secrets, raw provider tokens, private storage keys, or internal
  credentials;
- calculate date ranges using the requester's effective timezone;
- query source records with both source ID and organization ID where possible,
  rather than fetching by ID and checking ownership only afterward.

## Gap 4: attachment extraction and transcription

### Current behavior

Private upload, attachment metadata, and short-lived download URLs exist.
Attachment schemas also have `extractedText` and `transcription` fields.
There is no verified processor that populates those fields for ordinary chat
attachments.

### Required MVP behavior

Main Backend should own the secure extraction pipeline:

```text
upload -> malware/type/size validation -> private storage -> extraction job
       -> sanitized extracted text/transcription -> message AI job
```

Requirements:

- allow-list supported MIME types;
- enforce byte, page, duration, and extracted-text limits;
- scan or reject unsafe content;
- prevent SSRF and arbitrary URL fetching;
- keep provider/storage credentials out of the AI request;
- record extraction status and failure reason;
- send sanitized `extractedText` or `transcription` when available;
- when extraction is unavailable, tell AI Backend that the file content is
  unavailable instead of implying it was read.

Direct AI Backend download from a signed URL should remain disabled by default.
If enabled later, the URL must be short-lived and both services must enforce
the same size, type, timeout, privacy, and expiry policy.

## Gap 5: call transcription production readiness

The call-transcript analysis path already exists. However, local behavior is
disabled unless:

```text
AI_CALL_TRANSCRIPTION_ENABLED=true
```

Before declaring calls production-ready, verify:

- the flag is enabled in the target deployment;
- the transcription provider credentials are configured;
- callback/retry handling is observable;
- transcript records are organization-scoped;
- a completed transcript creates the expected analysis job;
- failed transcription does not leave a source indefinitely loading.

Do not assume the AI Backend can analyze raw call audio. The normal path is:

```text
Twilio recording -> Main Backend transcription -> CALL_TRANSCRIPT analysis
```

## Gap 6: Executive Briefing persistence

Phase 2 implementation status: completed. The dedicated Chief of Staff module
now contains the briefing model, repository, service, queue, controller, and
worker described below.

Add a dedicated Main Backend module. A recommended persistence record is:

```text
organizationId
requesterUserId
requesterScopeHash
schemaVersion
briefingType
period.start / period.end / period.timezone
jobId
idempotencyKey
inputHash
status
content
sourceRefs
freshness
confidence
failureCode / failureMessage
attemptCount
createdAt / updatedAt / completedAt
```

Suggested status values:

```text
QUEUED | GENERATING | READY | FAILED
```

Briefing cache and replay identity must include at least:

```text
organizationId
requesterUserId
requesterScopeHash
briefingType
period.start
period.end
period.timezone
schemaVersion
inputHash
```

If a briefing is intentionally organization-wide, use an explicit shared
scope constant. Do not accidentally reuse one user's permission-filtered
briefing for another user.

## Gap 7: build the Executive Briefing fact snapshot

Phase 2 implementation status: completed for current authoritative domains.
Unavailable business domains remain explicitly unavailable.

Main Backend owns fact collection and availability classification. AI Backend
must receive a closed, authorized snapshot and must not query Main Backend
databases.

The briefing request must support these categories:

```text
tasks
meetings
actionProposals
sourceAnalyses
agentActivity
sales
customers
support
finance
vendors
marketing
productDesign
roi
aiQuality
strategicNotes
```

Current realistic availability is:

| Fact category | Current readiness | MVP handling |
| --- | --- | --- |
| Tasks | Available | Build from Task records |
| Meetings | Available | Build from meeting/calendar records |
| Action proposals | Available | Build from AI action proposals |
| Source analyses | Partial | Label source-scoped analysis as partial |
| Agent activity | Available | Built from persisted source-analysis and briefing worker telemetry |
| Sales | Unavailable/partial | Use only an authoritative sales module if present |
| Customers | Unavailable | Requires account/customer identity and history |
| Support | Unavailable | Requires support/ticket source |
| Finance | Unavailable | Subscription billing is not customer business finance |
| Vendors | Unavailable | Requires vendor domain records |
| Marketing | Partial | Use only persisted, organization-owned campaign facts |
| Product/design | Partial | Use Tasks only when labels are explicit and truthful |
| ROI | Unavailable | Requires agreed formulas and source facts |
| AI quality | Partial | Runtime success, failure, running count, and latency are measured; model accuracy/eval scores remain unavailable |
| Strategic notes | Available | Built from persisted, organization-scoped CEO notes active for the briefing period/type |

Never fabricate design values to fill unavailable cards. The AI response
contract supports `UNAVAILABLE` sections.

## Gap 8: add briefing generation orchestration

Phase 2 implementation status: completed using the background briefing queue
and the canonical AI Backend route.

Briefings should use a background job because fact collection and AI generation
can exceed a normal request latency budget.

Recommended flow:

```text
Frontend generate request
  -> authorize requester
  -> calculate [start, end) period and timezone
  -> build permission-filtered fact snapshot
  -> compute scope hash and canonical input hash
  -> create/reuse briefing record
  -> enqueue job
  -> worker calls AI Backend
  -> validate complete response
  -> persist READY or FAILED
  -> frontend polls the Main Backend read route
```

Call the single AI route defined by the AI contract:

```http
POST {AI_SERVICE_URL}/api/v1/ai/briefings/generate
x-ai-actions-secret: <shared-secret>
```

Do not introduce a second competing AI route. Use a briefing-specific timeout
such as `AI_BRIEFING_TIMEOUT_MS`; the existing 30-second analysis timeout may
be too short.

Runtime response validation must verify:

- `jobId`, `briefingType`, and period match the request;
- every required stable section ID exists exactly once and in order;
- availability, status, severity, kind, direction, and trajectory enums are
  valid;
- confidence and numeric fields are finite and in range;
- every factual item and numeric metric has valid `sourceRefs`;
- every returned source reference exists in the submitted snapshot;
- executable decision items refer to real submitted proposal IDs;
- response size and item counts are bounded.

## Gap 9: add public Chief of Staff briefing APIs

Phase 2 implementation status: completed under the `Chief of Staff` Swagger
group.

Recommended Main Backend routes:

```http
POST /api/v1/chief-of-staff/briefings/:type/generate
GET  /api/v1/chief-of-staff/briefings/:type?asOf=<ISO timestamp>
GET  /api/v1/chief-of-staff/briefings/id/:briefingId
```

Allowed `:type` values:

```text
TODAY | TEAM_CHALLENGES | WEEKLY_REVIEW
```

Generation response example:

```json
{
  "success": true,
  "data": {
    "briefingId": "<id>",
    "status": "QUEUED",
    "pollAfterMs": 2000
  }
}
```

Read response behavior:

- return `QUEUED` or `GENERATING` while work is in progress;
- return the validated briefing content for `READY`;
- return a stable error code and retryability for `FAILED`;
- never hold the HTTP connection open while a background job runs;
- always enforce organization and requester scope on reads.

Restrict generation and executable CEO decision surfaces to appropriate roles,
normally `OWNER` and `ADMIN`, unless product requirements define a broader
permission.

## Stable UI section IDs

Main Backend must validate and store the same IDs defined in the AI contract.

### TODAY

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

### TEAM_CHALLENGES

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

### WEEKLY_REVIEW

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

## Gap 10: connect CEO decision cards to existing proposals

Approval, Sign-off, Escalation, and Review in the designs are display labels,
not new database action types.

For an executable decision card, the stored briefing item must include:

```json
{
  "proposalId": "<real-main-backend-proposal-id>",
  "proposalAction": "APPROVE",
  "recommendationOnly": false
}
```

The frontend then uses the existing command route:

```http
POST /api/v1/call-intelligence/proposals/:id/action
```

Rules:

- do not create a second approvals collection for AI Task/Meeting decisions;
- verify that `proposalId` belongs to the same organization and was present in
  the submitted facts;
- if no real proposal exists, set `recommendationOnly=true` and do not show an
  executable approve button;
- proposal status after execution remains authoritative in Main Backend;
- briefing content is a snapshot and must not pretend its embedded status is
  live after execution.

## Gap 11: agent runtime activity and measured health

Phase 3A implementation status: completed for source-analysis and Executive
Briefing background jobs.

The current Agent `ACTIVE` status describes catalog availability. It does not
prove uptime, workload, success, or recent activity.

To support the UI's "Agent Status" and "Overnight Movements" claims, add a
separate runtime activity/telemetry projection containing fields such as:

```text
agentId
organizationId
runId
operationType
sourceType / sourceId
status
startedAt / completedAt
failureCode / failureMessage
latency and optional token/cost metadata
```

The implementation persists this projection in `agent_activities` and exposes:

```http
GET /api/v1/chief-of-staff/insights/agent-activity
GET /api/v1/chief-of-staff/insights/ai-health
```

`ai-health` is a runtime reliability summary derived from completed activity;
it is not a model-accuracy or hallucination score. Catalog `ACTIVE` remains
separate and must not be presented as runtime health.

## Gap 12: Customer Intelligence is a separate domain gap

Source-level sentiment and health output cannot represent a customer-wide
health trend unless it is linked to a stable customer/account identity and
history.

Future Customer Intelligence requires at least:

- customer/account identity;
- linkage from calls, meetings, tasks, and proposals to that identity;
- time-series observation storage;
- transparent aggregation rules;
- freshness and source references;
- organization and role isolation.

Until those foundations exist:

- keep customer facts `UNAVAILABLE` or honestly `PARTIAL`;
- do not present a source health score as organization-wide customer health;
- do not invent churn prediction, NPS, renewal forecast, or major-account
  metrics.

## Gap 13: email remains suggestion-only for MVP

The current executable action types are only:

```text
CREATE_TASK | SCHEDULE_MEETING
```

Therefore Main Backend must not accept, persist, or execute `DRAFT_EMAIL` or
`SEND_EMAIL` from the AI response. Suggested email text may appear as clearly
unsaved assistant content.

If email execution is added later, it needs a separate contract covering
provider connection, recipients, draft persistence, approval, idempotency,
audit, and send confirmation. It is outside this MVP.

## Security, privacy, and reliability requirements

1. Keep the AI shared secret server-to-server only.
2. Validate organization ownership at database query boundaries.
3. Apply role and resource permissions before building snapshots.
4. Redact secrets, provider tokens, signed storage details, and unnecessary
   personal data.
5. Bound context, attachment, briefing, and response sizes.
6. Treat AI output as untrusted input and validate it at runtime.
7. Use deterministic idempotency keys for messages, proposals, and briefings.
8. Persist failure codes and retryability; do not leave endless loading states.
9. Log request/job IDs and durations without logging sensitive message or file
   contents.
10. Keep a source-reference audit trail for generated facts and decisions.
11. Do not expose cross-tenant cached content.
12. Never interpret `UNAVAILABLE` as zero or healthy.

## Recommended implementation order

### Phase 1: complete chat MVP

Implementation status: completed for the current MVP contract. Rich document,
image, audio, and video extraction remains future work.

1. Add runtime validation for the updated analyze-source response.
2. Persist `assistantMessage` idempotently.
3. Return it through existing conversation message APIs.
4. Add bounded, permission-aware Task/Meeting/Proposal chat facts.
5. Add attachment extraction status and honest unavailable behavior.

### Phase 2: Executive Briefings MVP

Implementation status: completed for the current AI contract.

1. Add briefing schema, repository, service, and indexes.
2. Add authorized fact snapshot builder and availability map.
3. Add queue processor and AI service client method.
4. Add strict briefing response validation.
5. Add generation and polling/read routes.
6. Connect executable decision cards to existing proposal commands.

### Phase 3: richer business intelligence

Phase 3A implementation status: completed.

Phase 3A adds source-analysis/briefing runtime telemetry, measured AI runtime
health, organization-scoped CEO strategic notes, and all three sources in the
Executive Briefing facts snapshot. Strategic-note APIs and insight APIs are
documented in `CHIEF_OF_STAFF_PHASE_3A_TEST_GUIDE.md`.

Later Phase 3 work should add authoritative customer, finance, vendor,
support, ROI, and model-evaluation sources one domain at a time. Change a
section from `UNAVAILABLE` only when the source and permission model are real.

## Main Backend acceptance checklist

### Chat

- [x] One user message creates at most one AI reply per `aiResponseId`.
- [x] Retrying the job does not duplicate replies, proposals, or message counts.
- [x] AI messages reference the original user message and correct conversation.
- [x] Malformed or mismatched AI responses are rejected and observable.
- [x] Task/Meeting cards come from structured proposals, not prose parsing.
- [x] Clarification questions remain available through existing proposal data.
- [x] The message list returns the stored AI reply without a new reply route.
- [x] Attachment-only requests explicitly identify unavailable file content.

### Briefings

- [x] Generation is asynchronous and returns a polling identifier.
- [x] Periods use the requester timezone and `[start, end)` boundaries.
- [x] Facts are organization- and permission-scoped before leaving Main Backend.
- [x] Cache identity includes requester scope and canonical input hash.
- [x] Every required section ID is stored once and in the required order.
- [x] Missing domains are represented as `UNAVAILABLE`, not fake zero values.
- [x] Every factual metric and item has valid source references.
- [x] Executable cards contain a real existing proposal ID.
- [x] Recommendation-only cards cannot contain executable proposal fields.
- [x] Failed jobs return a terminal error state instead of loading forever.

### Regression and security

- [ ] Existing analyze-source action ingestion still supports
  `CREATE_TASK` and `SCHEDULE_MEETING` unchanged.
- [ ] Existing clarification, approve, reject, retry, and execution logic is
  unchanged.
- [ ] Existing Call Intelligence public namespace remains authoritative.
- [ ] The browser never receives the AI shared secret or calls AI Backend.
- [ ] Cross-organization message, source, proposal, and briefing access fails.
- [ ] Logs and stored snapshots contain no provider tokens or storage secrets.
- [ ] Call transcription deployment settings are verified before production.

### Phase 3A

- [x] Source-analysis and briefing jobs persist organization-scoped runtime activity.
- [x] Telemetry write failures do not fail the underlying AI workflow.
- [x] Runtime health uses measured outcomes and latency, not Agent catalog status.
- [x] CEO strategic notes support organization-scoped create, list, update, and soft delete.
- [x] Active strategic notes, agent activity, and AI runtime health enter briefing facts with source references.

## Final implementation boundary

Main Backend must implement orchestration, persistence, permissions, fact
collection, availability, idempotency, polling, and proposal execution. AI
Backend must generate grounded assistant text and briefing presentation from
the supplied facts. Frontend must render Main Backend responses and use the
existing proposal command routes.

This separation avoids duplicate routes and collections while preserving all
existing Task, Meeting, Calendar, Message, and Call Intelligence business
logic.
