# AI Chief of Staff UI: Main Backend Readiness and Missing Work

## Scope

This document audits the supplied AI Chief of Staff chat and Executive
Briefing designs against the current Main Backend. It describes only missing
backend work; it does not require the frontend to call the AI Backend.

The required ownership remains:

```text
Frontend -> Main Backend -> background queue -> AI Backend
                              -> Main Backend persistence -> Frontend
```

## Readiness verdict

The existing Task/Meeting proposal MVP is reusable, but the complete screens
are not backend-ready yet.

| UI capability                         | Status                          | Current support / gap                                                                                                                                            |
| ------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Status chips                    | Partial                         | `GET /api/v1/agents` returns active catalog agents. `ACTIVE` means catalog-enabled, not runtime health or recent activity.                                       |
| Recent chats and New Chat             | Ready                           | `GET/POST /api/v1/messages/conversations` and paginated messages exist.                                                                                          |
| User sends chat message or attachment | Ready                           | `POST /api/v1/messages` persists input and queues `USER_MESSAGE` analysis.                                                                                       |
| Laura/agent conversational reply      | Missing                         | Message schema and `MessagesRepository.createAi()` exist, but the AI response contract has no assistant reply and the worker never calls `createAi()`.           |
| Task/meeting recommendation cards     | Ready                           | AI proposals, Action Center, clarification, approval, rejection, retry, Task creation, and provider Meeting creation exist.                                      |
| Meeting Confirm / Cancel              | Ready with mapping              | Confirm maps to proposal command `APPROVE`; Cancel maps to `REJECT` with a reason.                                                                               |
| Draft/send email                      | Missing                         | Gmail is only an integration-card placeholder. There is no Gmail OAuth/send service and `AiActionType` supports only `CREATE_TASK` and `SCHEDULE_MEETING`.       |
| Quick Action buttons                  | Frontend-ready                  | The labels can be static prompts sent through `POST /messages`. Dynamic organization-specific quick actions would need a new configuration endpoint.             |
| Customer Intelligence menu            | Missing except source snapshots | Per-call/meeting `healthScore`, `riskLevel`, sentiment, and patterns exist, but there is no customer/account entity, history, trend, churn, NPS, or renewal API. |
| Today's Briefing                      | Missing                         | No briefing schema, aggregation service, queue job, snapshot, or frontend route exists.                                                                          |
| Discuss Team Challenges               | Missing                         | Tasks provide partial facts, but there is no cross-domain challenge/decision briefing.                                                                           |
| Weekly Review                         | Missing                         | No organization-scoped weekly KPI snapshot or AI briefing contract exists.                                                                                       |

## What can be reused now

| UI area                                | Main Backend route                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Active agent cards                     | `GET /api/v1/agents?status=ACTIVE&page=1&limit=100`                                                          |
| Recent conversations                   | `GET /api/v1/messages/conversations?page=1&limit=20`                                                         |
| Start new chat                         | `POST /api/v1/messages/conversations`                                                                        |
| Send message/files                     | `POST /api/v1/messages`                                                                                      |
| Read conversation messages             | `GET /api/v1/messages?conversationId=:id&page=1&limit=30`                                                    |
| Read source action cards and questions | `GET /api/v1/ai-actions/sources/:messageId/action-center?sourceType=USER_MESSAGE&status=NEEDS_CLARIFICATION` |
| Submit one clarification               | `POST /api/v1/ai-actions/proposals/:id/clarifications`                                                       |
| Read completed proposals               | Same Action Center route with `status=PENDING`                                                               |
| Approve, reject, or retry              | `POST /api/v1/ai-actions/proposals/:id/action`                                                               |
| Task data                              | `GET /api/v1/tasks` with status, priority, department, assignee, and due-date filters                        |
| Calendar data                          | `GET /api/v1/calendar/events`                                                                                |
| Connected Meeting data                 | `GET /api/v1/meetings`                                                                                       |
| Meta marketing data                    | `GET /api/v1/meta/pages/:pageId/overview` and `/insights`                                                    |

## Important data limitations visible in the designs

### Agent status and overnight movement

The current `agents` collection is a global catalog. It does not store agent
runs, last success, last failure, current workload, or generated insights.
Do not label an agent as operationally healthy merely because its catalog
status is `ACTIVE`.

Required addition:

- `ai_agent_runs` or equivalent run telemetry;
- organization, agent ID, job type, status, started/finished timestamps;
- source references, output summary, failure reason, and token/cost metadata;
- organization-scoped recent movement aggregation.

### Business revenue and finance

`subscription-analytics` is platform-admin SaaS subscription revenue. It is
not the customer's sales revenue, cash flow, AR/AP, gross margin, or burn
rate. It must not populate Executive Briefings.

Required addition: organization-owned finance/sales integrations or a
normalized business-metrics ingestion API.

### Team accountability

The existing `team` module manages Noltra platform administrators, not the
customer organization's operating teams. Organization users plus Tasks can
provide partial assignee/task metrics, but a proper department/team ownership
model is still needed for the screenshot's accountability data.

### Health and AI accuracy

`GET /api/v1/health` is currently a stub and does not provide uptime, error
rate, AI accuracy, evaluation scores, or anomaly data. These metrics require
observability/evaluation storage and must not be fabricated by AI.

## Missing Main Backend section 1: assistant chat replies

Extend the `analyze-source` ingestion flow for `USER_MESSAGE` sources:

1. Accept optional `assistantMessage` from AI Backend.
2. Validate its stable `responseId`, non-empty content, and catalog-backed
   agent identity.
3. Persist it idempotently with the existing `MessagesRepository.createAi()`.
4. Increment the conversation message count and `lastMessageAt`.
5. Mark the source user message `COMPLETED` only after proposals and the reply
   are persisted.
6. `GET /messages` remains the frontend polling/read route for the reply.

The UI should render proposal cards separately using the user message ID as
the Action Center `sourceId`. AI narrative text must not be trusted as an
executable card.

## Missing Main Backend section 2: Executive Briefings module

Add a new `chief-of-staff` module containing:

- `ExecutiveBriefing` schema and unique period identity;
- DTOs and strict response validation;
- repository, aggregation service, controller;
- BullMQ generation job and processor;
- scheduled daily/weekly generation plus explicit on-demand generation;
- source freshness and availability metadata;
- audit logging for generation and failure.

Recommended briefing types:

```text
TODAY
TEAM_CHALLENGES
WEEKLY_REVIEW
```

Recommended statuses:

```text
QUEUED
GENERATING
READY
FAILED
```

Recommended persistence identity:

```text
organizationId + type + period.start + period.end + schemaVersion
```

Store `inputHash` so repeated generation from unchanged facts is idempotent.

### Required frontend routes

```http
POST /api/v1/chief-of-staff/briefings/:type/generate
GET  /api/v1/chief-of-staff/briefings/:type?asOf=2026-09-16
GET  /api/v1/chief-of-staff/briefings/:briefingId
```

The generate endpoint should enqueue work and return immediately:

```json
{
  "briefingId": "mongodb-id",
  "type": "TODAY",
  "status": "QUEUED"
}
```

The read endpoint should be safe to poll:

```json
{
  "id": "mongodb-id",
  "type": "TODAY",
  "status": "READY",
  "period": {
    "start": "2026-09-15T00:00:00.000Z",
    "end": "2026-09-16T00:00:00.000Z",
    "timezone": "UTC"
  },
  "summary": "...",
  "headlineMetrics": [],
  "sections": [],
  "sourceFreshness": [],
  "generatedAt": "2026-09-16T06:00:00.000Z"
}
```

### Stable section IDs required by the supplied screens

`TODAY`:

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

`TEAM_CHALLENGES`:

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

`WEEKLY_REVIEW`:

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

Each section should have `availability: AVAILABLE | PARTIAL | UNAVAILABLE`.
Unavailable integrations must produce an unavailable section, not invented
numbers.

## Missing Main Backend section 3: fact snapshot builder

Before calling AI Backend, Main Backend must collect and normalize facts. AI
Backend must not connect directly to MongoDB or third-party business accounts.

| Domain                              | Current availability | Main Backend work                                                                            |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| Tasks/milestones/deadlines/blockers | Partial              | Aggregate Task status, priority, department, assignee, due date, dependencies, and subtasks. |
| Meetings/calendar                   | Available            | Normalize past/upcoming Meeting and managed Calendar events.                                 |
| AI proposals/CEO decisions          | Available            | Aggregate `PENDING`, `NEEDS_CLARIFICATION`, `FAILED`, and executed proposals.                |
| Call/meeting intelligence           | Partial              | Aggregate source analyses over a period; preserve source IDs.                                |
| Agent activity                      | Missing              | Add agent-run telemetry and period summaries.                                                |
| Sales pipeline/business revenue     | Missing              | Add CRM deal/pipeline read integration and normalized snapshots.                             |
| Customer health/NPS/churn/renewal   | Missing              | Add customer/account entity, interaction linkage, and metric history.                        |
| Support/SLA/escalations             | Missing              | Add ticket/support integration and normalized snapshots.                                     |
| Finance/cash/AR/AP/burn/margin      | Missing              | Add finance/accounting integration or ingestion API.                                         |
| Vendor performance                  | Missing              | Add vendor, obligation, SLA, invoice, and risk models.                                       |
| Marketing                           | Partial              | Meta insights exist; add normalized cross-channel snapshots.                                 |
| Product/design output               | Partial              | Tasks can approximate work; dedicated release/asset records are absent.                      |
| ROI/efficiency                      | Missing              | Add automation run cost, baseline, time-saved, and outcome measurements.                     |
| AI/system quality                   | Missing              | Add AI eval, failure, latency, uptime, and anomaly metrics.                                  |
| CEO notes/strategic priorities      | Missing              | Add organization-scoped briefing notes and strategic objective records.                      |

Every fact sent to AI Backend should contain `sourceType`, `sourceId`,
`capturedAt`, and normalized values. This supports traceability and prevents
the briefing from becoming an unverified AI narrative.

## Missing Main Backend section 4: Customer Intelligence

The screenshot menu cannot be backed by the current single-source
`healthScore` alone. If these views are in MVP, add:

```http
GET /api/v1/customer-intelligence/overview
GET /api/v1/customer-intelligence/accounts
GET /api/v1/customer-intelligence/accounts/:id
```

Minimum models:

- customer/account identity and CRM provider IDs;
- linked calls, meetings, messages, tasks, deals, and support tickets;
- time-series health, sentiment, churn risk, NPS, renewal forecast;
- score version, explanation, evidence, and calculated timestamp.

If Customer Intelligence is not in MVP, keep the menu disabled/hidden and do
not derive company-level claims from one transcript.

## Email action decision

The chat mockup says an email was drafted and is ready in Outlook. That is not
supported by the current backend or previous AI action contract.

Choose one explicit future design:

1. Add `DRAFT_EMAIL` as a proposal action, provider OAuth, draft persistence,
   approval, and execution; or
2. Keep email narrative-only and remove any UI claim that a real draft exists.

For MVP safety, option 2 is recommended until provider integration and audit
requirements are implemented.

## Main Backend implementation order

1. Wire assistant replies into the existing message worker.
2. Implement briefing schema, queue, read/generate routes, and fact snapshot
   contract with available/partial/unavailable domains.
3. Populate Tasks, Meetings, proposals, and source-analysis facts first.
4. Add agent-run telemetry.
5. Add CRM/customer, support, finance, vendor, ROI, and AI-quality sources only
   when their source systems exist.
6. Add email as a new approved action in a separate phase.

## Main Backend acceptance checklist

- [ ] An ordinary user chat produces a persisted AI message, not only action proposals.
- [ ] Retrying one AI response cannot duplicate the assistant message.
- [ ] Proposal cards remain separately approvable and auditable.
- [ ] Each briefing type has an idempotent background generation job.
- [ ] Frontend can poll one Main Backend briefing resource until `READY`.
- [ ] Every displayed metric has a source reference and freshness timestamp.
- [ ] Missing integrations are marked unavailable; zero is never used as a substitute for missing data.
- [ ] Organization isolation applies to all briefing facts and snapshots.
- [ ] Platform subscription revenue is never shown as customer business revenue.
- [ ] No AI-generated Task, Meeting, email, or external side effect bypasses approval.
