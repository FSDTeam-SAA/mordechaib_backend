# AI Chief of Staff: AI Backend Implementation Contract

> Historical implementation-gap contract. Main Backend now persists
> `assistantMessage` and optional structured `assistantMessage.emailDraft`.
> Use `AI_CHIEF_OF_STAFF_FRONTEND_API_GUIDE.md` for the current frontend API
> and `EMAIL_DRAFT_AND_SEND_HANDOFF.md` for the current AI email-draft shape.

## Purpose and authority

This document is the implementation handoff from Main Backend to AI Backend
for the Chief of Staff chat and Executive Briefing screens.

It extends the existing source-analysis and clarification contracts. It does
not replace the already working `CREATE_TASK` and `SCHEDULE_MEETING` proposal
flow.

For conflicts between older AI documents and this document, use this document
for Chief of Staff features. Main Backend remains the system of record and the
only service allowed to persist or execute Tasks, Meetings, approvals,
calendar operations, email operations, or other external side effects.

```text
Frontend -> Main Backend -> background queue -> AI Backend
                              -> Main Backend persistence -> Frontend
```

AI Backend must return raw JSON. Do not wrap responses in `{ "success": true,
"data": ... }`.

## Verified Main Backend boundary

The current Main Backend supports:

- `POST /api/v1/ai/jobs/analyze-source` calls to AI Backend;
- `POST /api/v1/ai/actions/refine` calls to AI Backend;
- agent catalog bootstrap and `/api/v1/ai/agents/events` synchronization;
- `CREATE_TASK` and `SCHEDULE_MEETING` proposals;
- sequential clarification, approval, rejection, retry, and execution;
- source-level analysis persistence;
- user conversations, message attachments, and proposal cards.

The current Main Backend does not yet:

- accept, validate, and persist an AI `assistantMessage` from analyze-source;
- supply Task, Meeting, finance, CRM, or other organization-wide facts in the
  normal chat source context;
- generate, store, or expose Executive Briefings;
- support `DRAFT_EMAIL` or any other email action;
- extract text/transcription from every uploaded chat attachment;
- provide organization-wide agent-runtime, customer-health, sales, finance,
  vendor, support, ROI, or AI-quality facts.

`MessagesRepository.createAi()` and the required message fields already exist,
so assistant-message persistence is partially scaffolded in Main Backend, but
the end-to-end flow is not implemented.

## Mismatch resolution matrix

| Area                | Conflict or ambiguity                                                                                                       | Canonical decision                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Analyze response    | Older response has only `requestId`, `source`, `actions`, and `analysis`                                                    | Preserve all existing fields and add optional `assistantMessage` only for `USER_MESSAGE`                                 |
| Response wrapping   | Some APIs use `{ success, data }`                                                                                           | AI-to-Main responses must be raw JSON                                                                                    |
| Chat knowledge      | Existing message context has conversation, attachments, and pending proposals but no general Task/Meeting/CRM/finance facts | Answer only from supplied context/facts; explicitly state unavailable data                                               |
| Briefing route      | Older notes mention `/api/v1/ai/chief-of-staff/briefings`                                                                   | Canonical new route is `POST /api/v1/ai/briefings/generate`                                                              |
| Action types        | UI contains email and decision language                                                                                     | Executable `actions` remain only `CREATE_TASK` and `SCHEDULE_MEETING`                                                    |
| Approval ownership  | UI displays Approval, Sign-off, Escalation, and Review                                                                      | These are presentation categories; only a real Main Backend proposal ID is executable                                    |
| Proposal IDs        | AI does not know MongoDB proposal IDs during source analysis                                                                | Never invent a proposal ID; Main Backend creates it after ingestion                                                      |
| Refinement identity | A refinement could accidentally create a new action                                                                         | Preserve the original `actionId` and `actionType` exactly                                                                |
| Risk level          | Older examples use only LOW/HIGH-style values; no-data examples need UNKNOWN                                                | Use `UNKNOWN                                                                                                             | LOW | MEDIUM | HIGH | CRITICAL`; use `UNKNOWN` when evidence is absent |
| Missing metrics     | Mockups contain plausible numbers                                                                                           | Missing data is `UNAVAILABLE`, never zero or an estimate                                                                 |
| Attachment handling | Main Backend supplies attachment metadata and short-lived URLs, but extraction is incomplete                                | Do not claim file understanding unless usable extracted text/transcription was supplied or AI securely processed the URL |
| Raw call audio      | Normal Main flow transcribes locally and then sends `CALL_TRANSCRIPT`                                                       | Do not claim raw `CALL_AUDIO` analysis unless actual audio transport is present                                          |
| Timeout             | Main Backend AI HTTP timeout defaults to 30 seconds                                                                         | Analyze-source must meet the budget or return a retryable failure; briefing generation is invoked from a background job  |
| Idempotency         | A process-local cache is not safe across replicas                                                                           | Use durable/shared idempotency appropriate to the deployed topology                                                      |
| Agent status        | Catalog status `ACTIVE` may be mistaken for runtime health                                                                  | `ACTIVE` means assignable catalog entry only, not operational health                                                     |
| Timezone            | Relative-date examples previously crossed the wrong UTC day                                                                 | Use the supplied effective timezone and emit offset-aware ISO timestamps                                                 |

## 1. Existing analyze-source request

### Route and authentication

```http
POST {AI_SERVICE_URL}/api/v1/ai/jobs/analyze-source
x-ai-actions-secret: <shared-secret>
Content-Type: application/json
```

Main Backend sends:

```json
{
  "schemaVersion": "1.0",
  "jobId": "source-user_message-<message-id>",
  "idempotencyKey": "source-user_message-<message-id>",
  "organizationId": "<organization-id>",
  "source": {
    "type": "USER_MESSAGE",
    "id": "<message-id>"
  },
  "context": {},
  "generatedAt": "2026-09-18T06:00:00.000Z"
}
```

Allowed source types remain:

```text
CALL_AUDIO | CALL_TRANSCRIPT | ZOOM_MEETING | GOOGLE_MEET | USER_MESSAGE
```

`jobId`, `idempotencyKey`, response `requestId`, and the exact echoed source
are correlated. AI Backend must treat `source.id` as an opaque identifier.

### Context currently available for USER_MESSAGE

Depending on available records, Main Backend currently sends:

- source message content and timestamps;
- up to 20 conversation messages;
- organization and requester metadata;
- effective timezone;
- active attachments with metadata, processing fields, optional extracted
  text/transcription, and a short-lived authorized download URL;
- pending conversation proposals and clarification state.

It does not currently send general organization Tasks, Meetings, calendar,
CRM, finance, or sales facts in this request. AI Backend must not infer those
records from the user's wording.

Main Backend may later add an optional permission-checked `context.facts`
object. AI Backend must tolerate its absence. Each supplied category will use:

```json
{
  "availability": "AVAILABLE",
  "items": [
    {
      "id": "stable-fact-id",
      "sourceType": "TASK",
      "sourceId": "main-backend-record-id",
      "capturedAt": "2026-09-18T05:30:00.000Z",
      "data": {}
    }
  ]
}
```

`AVAILABLE` with an empty array means a known zero. `UNAVAILABLE` means the
answer is unknown. `PARTIAL` must not be generalized to the whole
organization.

## 2. Analyze-source response with assistantMessage

### Required response shape

Continue returning the existing response, with optional `assistantMessage`
for `USER_MESSAGE` only:

```json
{
  "requestId": "source-user_message-<message-id>",
  "source": {
    "type": "USER_MESSAGE",
    "id": "<message-id>"
  },
  "assistantMessage": {
    "responseId": "source-user_message-<message-id>:reply:v1",
    "content": "I prepared a meeting proposal. What time should it start?",
    "agent": {
      "id": "<active-catalog-agent-id>",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    },
    "runId": "optional-stable-ai-run-id"
  },
  "actions": [],
  "analysis": {
    "summary": "The user requested a meeting but did not provide a start time.",
    "overallConfidence": 0.9,
    "sentimentAnalysis": {
      "score": {
        "positive": 0,
        "neutral": 100,
        "negative": 0
      }
    },
    "customerIntelligence": {
      "healthScore": 50,
      "riskLevel": "UNKNOWN"
    },
    "patternDetection": {},
    "classifiedSegments": []
  }
}
```

### Assistant-message rules

1. `assistantMessage` is allowed only when `source.type` is `USER_MESSAGE`.
2. `responseId` must be deterministic for the same logical response revision,
   at most 200 characters, and stable across retries.
3. `content` must be non-empty plain text or Markdown and at most 20,000
   characters.
4. `agent.id`, `agent.name`, and `agent.type` must match one synchronized,
   currently active catalog agent.
5. `runId`, when returned, must be stable for an idempotent replay.
6. A Task or Meeting card must come from `actions`; Main Backend will never
   parse narrative text into an executable proposal.
7. Clarification questions in `actions[].clarificationQuestions` are the
   authoritative structured questions. Assistant prose may introduce the
   first unresolved question but must not contradict the structured list.
8. Never say an action was created, scheduled, approved, sent, added to a
   calendar, or saved as a draft before Main Backend reports successful
   execution.
9. If the supplied context cannot answer a question, clearly state which data
   is unavailable.
10. For non-`USER_MESSAGE` sources, omit `assistantMessage` rather than
    returning `null`.

### Existing action contract must remain unchanged

Only these executable action types are accepted:

```text
CREATE_TASK | SCHEDULE_MEETING
```

Each action must include:

- unique `actionId`, maximum 128 characters;
- supported `actionType`;
- active catalog-backed `proposedByAgent`;
- action payload;
- finite `confidence` from 0 to 1;
- evidence and clarification questions when applicable.

For `SCHEDULE_MEETING`, do not invent `startsAt`, invitees, or email
addresses. Missing required values must become clarification questions.
Offset-aware timestamps must contain `Z` or an explicit UTC offset.

### Analysis compatibility

- sentiment positive, neutral, and negative values must be 0-100 and sum to
  100;
- health score must be 0-100;
- when risk is `UNKNOWN`, the currently required numeric health score is only
  a neutral compatibility value and must not be described as evidence of a
  healthy customer;
- pattern values, when present, must be 0-100;
- overall confidence, when present, must be 0-1;
- use risk level `UNKNOWN` when customer risk cannot be grounded;
- source analysis remains source-scoped and must not be described as an
  organization-wide customer trend.

## 3. Existing clarification refinement contract

### Request

```http
POST {AI_SERVICE_URL}/api/v1/ai/actions/refine
x-ai-actions-secret: <shared-secret>
Content-Type: application/json
```

```json
{
  "requestId": "source-user_message-<message-id>",
  "proposal": {},
  "clarification": {
    "questionId": "meeting-start-time",
    "answer": "2026-09-20T10:00:00+06:00"
  }
}
```

### Response

```json
{
  "action": {
    "actionId": "meeting-001",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {},
    "payload": {},
    "confidence": 0.95,
    "evidence": [],
    "clarificationQuestions": []
  }
}
```

The response must preserve the original `actionId` and `actionType`. Return
all still-unresolved clarification questions. Main Backend will move the
proposal to `PENDING` only after none remain.

## 4. Executive Briefing generation

### Canonical AI route

```http
POST {AI_SERVICE_URL}/api/v1/ai/briefings/generate
x-ai-actions-secret: <shared-secret>
Content-Type: application/json
```

Do not implement `/api/v1/ai/chief-of-staff/briefings` as a second competing
contract. If an older route must remain temporarily, it must be a deprecated
alias that delegates to this exact contract.

### Request

```json
{
  "schemaVersion": "1.0",
  "jobId": "briefing-<organization>-<scope>-today-2026-09-18",
  "idempotencyKey": "briefing-<organization>-<scope>-today-2026-09-18-<input-hash>",
  "organizationId": "<organization-id>",
  "briefingType": "TODAY",
  "period": {
    "start": "2026-09-17T18:00:00.000Z",
    "end": "2026-09-18T18:00:00.000Z",
    "timezone": "Asia/Dhaka"
  },
  "requester": {
    "userId": "<user-id>",
    "name": "Rifat Hossain",
    "language": "en",
    "scopeHash": "<permission-scope-hash>"
  },
  "organization": {
    "name": "Example Ltd.",
    "industry": "Software"
  },
  "agents": [],
  "facts": {
    "tasks": { "availability": "AVAILABLE", "items": [] },
    "meetings": { "availability": "AVAILABLE", "items": [] },
    "actionProposals": { "availability": "AVAILABLE", "items": [] },
    "sourceAnalyses": { "availability": "PARTIAL", "items": [] },
    "agentActivity": { "availability": "UNAVAILABLE", "items": [] },
    "sales": { "availability": "UNAVAILABLE", "items": [] },
    "customers": { "availability": "UNAVAILABLE", "items": [] },
    "support": { "availability": "UNAVAILABLE", "items": [] },
    "finance": { "availability": "UNAVAILABLE", "items": [] },
    "vendors": { "availability": "UNAVAILABLE", "items": [] },
    "marketing": { "availability": "PARTIAL", "items": [] },
    "productDesign": { "availability": "PARTIAL", "items": [] },
    "roi": { "availability": "UNAVAILABLE", "items": [] },
    "aiQuality": { "availability": "UNAVAILABLE", "items": [] },
    "strategicNotes": { "availability": "UNAVAILABLE", "items": [] }
  },
  "generatedAt": "2026-09-18T06:00:00.000Z"
}
```

Main Backend owns authorization, organization isolation, fact collection,
period calculation, and availability classification. AI Backend must not call
Main Backend databases or third-party providers to fill gaps.

Each fact item must contain:

```json
{
  "id": "stable-fact-id",
  "sourceType": "TASK",
  "sourceId": "main-backend-record-id",
  "capturedAt": "2026-09-18T05:30:00.000Z",
  "data": {}
}
```

### Response

```json
{
  "jobId": "briefing-<organization>-<scope>-today-2026-09-18",
  "briefingType": "TODAY",
  "period": {
    "start": "2026-09-17T18:00:00.000Z",
    "end": "2026-09-18T18:00:00.000Z",
    "timezone": "Asia/Dhaka"
  },
  "summary": "One high-priority task requires attention. Finance data was not supplied.",
  "trajectory": "UNKNOWN",
  "headlineMetrics": [
    {
      "key": "tasks_due_today",
      "label": "Tasks due today",
      "value": 1,
      "unit": "COUNT",
      "direction": "UNKNOWN",
      "severity": "INFO",
      "sourceRefs": ["task-fact-1"]
    }
  ],
  "sections": [
    {
      "id": "primary_focus",
      "title": "Today's Primary Focus",
      "kind": "LIST",
      "availability": "AVAILABLE",
      "summary": "Review the quotation due today.",
      "items": [
        {
          "id": "focus-task-fact-1",
          "label": "Review quotation",
          "detail": "High-priority task due today",
          "status": "AT_RISK",
          "severity": "HIGH",
          "sourceRefs": ["task-fact-1"],
          "recommendationOnly": true
        }
      ]
    },
    {
      "id": "ceo_action_items",
      "title": "CEO Action Items",
      "kind": "DECISION_CARDS",
      "availability": "AVAILABLE",
      "summary": "One proposal is awaiting approval.",
      "items": [
        {
          "id": "decision-proposal-fact-1",
          "label": "Approve project meeting",
          "status": "PENDING",
          "severity": "MEDIUM",
          "sourceRefs": ["proposal-fact-1"],
          "proposalId": "<real-main-backend-proposal-id>",
          "proposalAction": "APPROVE",
          "recommendationOnly": false
        }
      ]
    },
    {
      "id": "financial_pulse",
      "title": "Financial Pulse",
      "kind": "TEXT",
      "availability": "UNAVAILABLE",
      "summary": "Finance data was not supplied.",
      "items": []
    }
  ],
  "sourceRefs": [
    {
      "ref": "task-fact-1",
      "sourceType": "TASK",
      "sourceId": "<task-id>",
      "capturedAt": "2026-09-18T05:30:00.000Z"
    },
    {
      "ref": "proposal-fact-1",
      "sourceType": "AI_ACTION_PROPOSAL",
      "sourceId": "<real-main-backend-proposal-id>",
      "capturedAt": "2026-09-18T05:45:00.000Z"
    }
  ],
  "confidence": 0.86
}
```

The example is abbreviated. A real successful response must include every
required section ID for the requested briefing type, even when a section is
`UNAVAILABLE`.

### Allowed values

```text
briefingType: TODAY | TEAM_CHALLENGES | WEEKLY_REVIEW
trajectory: POSITIVE | NEUTRAL | NEGATIVE | UNKNOWN
availability: AVAILABLE | PARTIAL | UNAVAILABLE
kind: TEXT | LIST | AGENT_CARDS | DECISION_CARDS | METRIC_GRID | PROGRESS | DONUT
direction: UP | DOWN | FLAT | UNKNOWN
severity: INFO | LOW | MEDIUM | HIGH | CRITICAL
unit: COUNT | PERCENT | CURRENCY_USD | MINUTES | HOURS | SCORE | TEXT
proposalAction: APPROVE | REJECT | RETRY
```

`status` on generic section items is a bounded display string supplied or
derived from facts; it is not an executable state transition.

## 5. Required stable section IDs

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

## 6. Grounding and source-reference rules

1. Never invent a metric, amount, percentage, customer, vendor, deadline,
   completed action, proposal ID, or provider operation.
2. Every factual section item must reference at least one supplied fact.
3. Every numeric value must reference every contributing fact, or one
   authorized derived-aggregate fact whose `data` describes its derivation.
4. Every returned reference must exist in the submitted fact set.
5. `UNAVAILABLE` input remains unavailable. Do not turn it into zero.
6. `PARTIAL` input remains explicitly partial and must not become an
   organization-wide claim.
7. Recommendations must use `recommendationOnly: true` unless backed by a
   real executable Main Backend proposal.
8. A decision item with `recommendationOnly: false` must contain a real
   `proposalId` supplied in facts.
9. Platform subscription analytics must never be represented as the
   customer's business revenue.
10. Source-level sentiment, health score, or risk must not become a customer-
    wide trend without linked customer history.
11. Agent catalog `ACTIVE` status must not be described as uptime, health,
    recent success, workload, or operational activity.
12. Preserve source timestamps and the supplied `[start, end)` period.
13. Return all stable section IDs in the documented order.

## 7. Idempotency and requester scope

Briefings may be organization-wide or permission-personalized. Main Backend
will include `requester.scopeHash` to distinguish authorized fact scopes.

AI Backend must bind idempotency to a canonical hash containing at least:

```text
organizationId
requester.userId
requester.scopeHash
briefingType
period.start
period.end
period.timezone
schemaVersion
authorized fact set and availability values
```

Required behavior:

- same idempotency key and same canonical input: replay the same logical
  response;
- same idempotency key and different canonical input: return `409`;
- stable response item IDs across retries;
- no process-local-only cache when multiple replicas may handle requests.

## 8. CEO action items and approval boundary

Labels such as Approval, Sign-off, Escalation, and Review are display
categories, not new action types.

- Use Main Backend proposal facts for executable Task/Meeting decisions.
- Return the exact real Main Backend proposal ID from facts.
- Set `recommendationOnly: false` only for an executable proposal.
- Set `recommendationOnly: true` when no executable proposal exists.
- Never create a second approval object or new proposal vocabulary.
- Never claim that an approval or external action changed state until a later
  Main Backend fact reports the executed result.

## 9. Email behavior

Email remains outside executable AI `actions`.

- Do not return `DRAFT_EMAIL`, `SEND_EMAIL`, or any email action in `actions`.
- To propose an email, return the optional structured
  `assistantMessage.emailDraft` defined in `EMAIL_DRAFT_AND_SEND_HANDOFF.md`.
- Main Backend validates and stores the platform draft. AI Backend must never
  claim it was sent.
- Only the authenticated owner can explicitly send through Main Backend after
  reviewing the stored draft.

## 10. Attachments and calls

### Attachments

Main Backend may send a short-lived attachment URL plus optional
`extractedText` or `transcription`.

- Prefer supplied extracted content when present.
- If AI Backend downloads an authorized URL, enforce agreed type, size,
  timeout, malware/privacy, and expiry controls.
- Do not state that a file was read when it was not fetched or extracted.
- A file-only message without usable extracted content must receive an honest
  limitation response, not fabricated analysis.

### Calls

The normal production path is:

```text
Twilio recording -> Main Backend transcription -> CALL_TRANSCRIPT analysis
```

Main Backend's local transcription feature defaults to disabled unless
`AI_CALL_TRANSCRIPTION_ENABLED=true`. AI Backend must not assume raw audio is
present merely because `source.type` is `CALL_AUDIO` or `audioAvailable=true`.

## 11. Error contract

Return JSON errors with these meanings:

| HTTP  | Meaning                                                                 |
| ----- | ----------------------------------------------------------------------- |
| `400` | Invalid schema, source identity, period, type, fact, or output contract |
| `401` | Missing or invalid shared secret                                        |
| `409` | Same idempotency key reused with different canonical input              |
| `422` | Structurally valid input cannot produce any valid required contract     |
| `429` | AI service rate-limited; Main Backend may retry                         |
| `503` | Model/orchestrator dependency unavailable; Main Backend may retry       |

Missing optional domains such as finance, CRM, vendor, or support must not
cause `422`. Return a successful partial briefing with those sections marked
`UNAVAILABLE`.

Do not return fabricated fallback content when required processing fails.

## 12. Implementation order

1. Preserve existing analyze-source and refinement behavior.
2. Add optional `assistantMessage` for `USER_MESSAGE`.
3. Add strict input/output validation and deterministic response IDs.
4. Pass existing Task/Meeting/refinement regression tests.
5. Implement `/api/v1/ai/briefings/generate` with durable idempotency.
6. Support Task, Meeting, proposal, and source-analysis facts first.
7. Add grounding/reference validation and explicit unavailable sections.
8. Support additional domains only after Main Backend supplies authorized
   available facts.

## 13. Acceptance checklist

### Existing contract regression

- [ ] Analyze-source returns raw JSON with exact `requestId` and source echo.
- [ ] Existing meeting/call/message action extraction still works.
- [ ] Only `CREATE_TASK` and `SCHEDULE_MEETING` are returned in `actions`.
- [ ] Refinement preserves the original `actionId` and `actionType`.
- [ ] Missing meeting date/time/email produces clarification questions rather
      than invented values.
- [ ] Agent identities come from the synchronized active catalog.

### Chat

- [ ] A normal `USER_MESSAGE` returns exactly one deterministic assistant
      reply across retries.
- [ ] A scheduling message may return both assistant text and a structured
      `SCHEDULE_MEETING` proposal.
- [ ] Assistant text does not claim an unapproved proposal was executed.
- [ ] Questions requiring unavailable organization facts receive an explicit
      limitation.
- [ ] Non-message sources omit `assistantMessage`.
- [ ] File-only input without usable file content is handled honestly.

### Briefings

- [ ] All three briefing types accept the common fact envelope.
- [ ] Every required stable section ID is returned in the documented order.
- [ ] Unsupported domains remain `UNAVAILABLE`.
- [ ] Every factual item and numeric output has valid supplied references.
- [ ] Partial single-source data is never generalized organization-wide.
- [ ] Executable decision cards use real supplied proposal IDs.
- [ ] Recommendation-only cards cannot invoke an approval command.
- [ ] Same idempotency key/input replays the same logical output.
- [ ] Same key with changed input returns `409`.
- [ ] Requester scope participates in idempotency.
- [ ] Timezone day/week boundary tests pass, including Asia/Dhaka relative
      dates.

### Reliability

- [ ] Analyze-source meets the agreed 30-second Main Backend timeout or
      returns a retryable error.
- [ ] Multi-replica idempotency does not depend on local disk/process memory.
- [ ] Disabled or stale catalog agents are never newly assigned.
- [ ] No response claims a Task, Meeting, calendar event, email, CRM update,
      or approval was executed by AI Backend.
