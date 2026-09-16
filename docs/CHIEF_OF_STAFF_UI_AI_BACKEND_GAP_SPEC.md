# AI Chief of Staff UI: AI Backend Contract and Missing Work

## Scope

This is the AI Backend handoff for the supplied Chief of Staff chat and
Executive Briefing designs. It extends, but does not replace, the existing
Task/Meeting analysis contracts.

AI Backend returns structured JSON only. It never writes Main Backend data,
calls provider APIs, or claims an external action was completed.

## Previous contract coverage

| Capability from previous docs                                | Contract status for these screens                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `POST /api/v1/ai/jobs/analyze-source`                        | Reusable and already exercised for meeting/call action extraction.                            |
| `POST /api/v1/ai/actions/refine`                             | Reusable for sequential clarification.                                                        |
| Agent catalog bootstrap and `/api/v1/ai/agents/events`       | Reusable for catalog-backed agent identity.                                                   |
| `CREATE_TASK` and `SCHEDULE_MEETING`                         | Reusable for chat proposal cards.                                                             |
| Sentiment, health score, risk, patterns, classified segments | Reusable only as source-level intelligence. They are not organization-wide briefing metrics.  |
| Conversational assistant reply                               | Not defined in previous contracts.                                                            |
| Executive Briefing generation                                | Not defined in previous contracts.                                                            |
| Email draft/send action                                      | Explicitly out of the previous MVP.                                                           |
| CRM/customer aggregation                                     | Explicitly absent; the current Main Backend details response reserves `extensions.crm: null`. |

The Main Backend repository cannot prove the deployed AI Backend's internal
implementation. Compatibility must be verified with the acceptance tests in
this document.

## Missing AI Backend section 1: assistant message response

For `source.type = USER_MESSAGE`, extend the existing analyze response with an
optional `assistantMessage`:

```json
{
  "requestId": "source-user_message-message-id",
  "source": {
    "type": "USER_MESSAGE",
    "id": "message-id"
  },
  "assistantMessage": {
    "responseId": "source-user_message-message-id:reply:v1",
    "content": "I found an available time and prepared a meeting proposal for your approval.",
    "agent": {
      "id": "catalog-mongodb-agent-id",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    },
    "runId": "optional-ai-run-id"
  },
  "actions": [],
  "analysis": {
    "sentimentAnalysis": {
      "score": { "positive": 0, "neutral": 100, "negative": 0 }
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

Rules:

- `assistantMessage` is allowed only for `USER_MESSAGE`.
- `responseId` must be stable for the same `jobId` and response revision.
- `content` must be plain/Markdown text, maximum 20,000 characters.
- `agent.id`, `name`, and `type` must come from the synchronized active catalog.
- Do not embed fake proposal database IDs. AI Backend does not know them.
- A meeting/task UI card comes from the structured `actions` array, not from
  parsing `assistantMessage.content`.
- Never say "created", "sent", "added to calendar", or "ready in Outlook"
  before Main Backend approval and successful execution.
- If no grounded answer is possible, state what data is unavailable.

## Missing AI Backend section 2: briefing generation endpoint

Implement:

```http
POST {AI_SERVICE_URL}/api/v1/ai/briefings/generate
x-ai-actions-secret: <shared-secret>
Content-Type: application/json
```

### Request

```json
{
  "schemaVersion": "1.0",
  "jobId": "briefing-org-id-today-2026-09-16",
  "idempotencyKey": "briefing-org-id-today-2026-09-16-input-hash",
  "organizationId": "org-id",
  "briefingType": "TODAY",
  "period": {
    "start": "2026-09-15T00:00:00.000Z",
    "end": "2026-09-16T00:00:00.000Z",
    "timezone": "UTC"
  },
  "requester": {
    "userId": "user-id",
    "name": "Rifat Hossain",
    "language": "en"
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
  "generatedAt": "2026-09-16T06:00:00.000Z"
}
```

Every fact item must already be organization-authorized by Main Backend and
should include:

```json
{
  "id": "stable-fact-id",
  "sourceType": "TASK",
  "sourceId": "mongodb-or-provider-id",
  "capturedAt": "2026-09-16T05:30:00.000Z",
  "data": {}
}
```

AI Backend must not fetch missing business facts directly from Main Backend,
MongoDB, CRM, calendar, or accounting providers.

### Response

```json
{
  "jobId": "briefing-org-id-today-2026-09-16",
  "briefingType": "TODAY",
  "period": {
    "start": "2026-09-15T00:00:00.000Z",
    "end": "2026-09-16T00:00:00.000Z",
    "timezone": "UTC"
  },
  "summary": "Grounded executive summary.",
  "trajectory": "POSITIVE",
  "headlineMetrics": [
    {
      "key": "completed_tasks",
      "label": "Completed tasks",
      "value": 8,
      "unit": "COUNT",
      "direction": "UP",
      "severity": "INFO",
      "sourceRefs": ["task-id-1", "task-id-2"]
    }
  ],
  "sections": [
    {
      "id": "primary_focus",
      "title": "Today's Primary Focus",
      "kind": "LIST",
      "availability": "PARTIAL",
      "summary": "Complete the highest-priority overdue customer commitment.",
      "items": [
        {
          "id": "focus-1",
          "label": "Close quotation follow-up",
          "detail": "High-priority task due today",
          "status": "AT_RISK",
          "severity": "HIGH",
          "sourceRefs": ["task-id-1"]
        }
      ]
    }
  ],
  "sourceRefs": [
    {
      "ref": "task-id-1",
      "sourceType": "TASK",
      "sourceId": "task-id-1",
      "capturedAt": "2026-09-16T05:30:00.000Z"
    }
  ],
  "confidence": 0.86
}
```

### Allowed values

```text
briefingType: TODAY | TEAM_CHALLENGES | WEEKLY_REVIEW
trajectory: POSITIVE | NEUTRAL | NEGATIVE | UNKNOWN
availability: AVAILABLE | PARTIAL | UNAVAILABLE
kind: TEXT | LIST | AGENT_CARDS | DECISION_CARDS | METRIC_GRID | PROGRESS | DONUT
direction: UP | DOWN | FLAT | UNKNOWN
severity: INFO | LOW | MEDIUM | HIGH | CRITICAL
unit: COUNT | PERCENT | CURRENCY_USD | MINUTES | HOURS | SCORE | TEXT
```

All IDs must be stable within an idempotent retry. `confidence` must be a
finite number from `0` to `1`.

## Required section IDs

AI Backend may return unavailable sections, but must use these stable IDs so
frontend layouts do not depend on generated titles.

### `TODAY`

```text
primary_focus, overnight_movements, ceo_action_items, pipeline_revenue,
client_health, operational_status, financial_pulse, vendor_accountability,
marketing_growth, design_status, ceo_notes
```

### `TEAM_CHALLENGES`

```text
completed_milestones, ceo_action_items, next_day_decisions, key_risks,
strategic_blockers, financial_movements, operational_metrics,
vendor_performance, priority_alignment, team_accountability, escalations,
ceo_notes
```

### `WEEKLY_REVIEW`

```text
executive_summary, roi_efficiency, sales_revenue, client_health,
delivery_milestones, marketing_growth, product_creative, ai_system_health,
financial_movements, vendor_performance, strategic_shift, ceo_notes
```

## Grounding rules

1. Never invent a metric, currency amount, percentage, customer, vendor,
   deadline, or completed action.
2. A numeric value requires at least one valid `sourceRef`.
3. `UNAVAILABLE` input remains unavailable in output. Do not convert missing
   data into zero.
4. `PARTIAL` input must be labeled partial and must not be generalized to the
   whole organization.
5. Separate facts from recommendations. Recommendations may be generated, but
   must be labeled as recommendations and contain no invented measurements.
6. Do not treat Main Backend platform subscription analytics as the customer
   organization's business revenue.
7. Source-level call sentiment or health is not a customer-wide trend unless
   Main Backend supplies a linked, aggregated customer history.
8. Do not claim an agent is healthy based only on catalog `ACTIVE` status.
9. Preserve Main Backend timestamps and calculate periods in the supplied
   timezone.
10. Return JSON only and never execute Task, Meeting, calendar, email, CRM, or
    approval operations.

## CEO action items

Use Main Backend proposal facts for real executable Task/Meeting decisions.
Briefing `ceo_action_items` entries may reference proposal IDs, but they must
not create a second approval object or a new action vocabulary.

For labels such as Approval, Sign-off, Escalation, and Review:

- use them as presentation categories only;
- include the real Main Backend proposal/action ID when executable;
- otherwise mark them `recommendationOnly: true`;
- never claim approval changed state until Main Backend reports it.

## Email behavior

The previous MVP intentionally excluded email actions. Until Main Backend adds
a `DRAFT_EMAIL` proposal and provider integration:

- do not return email in `actions`;
- do not say an Outlook/Gmail draft was created;
- it is acceptable to return suggested email text in `assistantMessage`,
  clearly labeled as a suggestion that has not been saved or sent.

## Error contract

Use standard JSON errors:

| HTTP  | Meaning                                                        |
| ----- | -------------------------------------------------------------- |
| `400` | Invalid schema, period, type, or facts                         |
| `401` | Missing/invalid shared secret                                  |
| `409` | Same idempotency key reused with different input               |
| `422` | Facts are valid JSON but cannot support the requested briefing |
| `503` | Model/orchestrator dependency unavailable; queue retry is safe |

Do not return a successful briefing containing fabricated fallback content
when required processing fails.

## AI Backend implementation order

1. Add optional `assistantMessage` to `USER_MESSAGE` analyze responses.
2. Keep current Task/Meeting action and clarification contracts unchanged.
3. Implement `/api/v1/ai/briefings/generate` with strict request/response
   validation and idempotency.
4. Add grounding checks that reject output values without source references.
5. Support available Task/Meeting/proposal/source-analysis facts first.
6. Render new domains only after Main Backend supplies them as available.

## AI Backend acceptance checklist

- [ ] A normal `USER_MESSAGE` returns an idempotent assistant reply.
- [ ] A scheduling message may return both assistant text and a structured `SCHEDULE_MEETING` proposal.
- [ ] Assistant text never claims that an unapproved proposal was executed.
- [ ] All three briefing types accept the same common fact envelope.
- [ ] Every numeric output has a valid source reference.
- [ ] Unavailable finance/CRM/vendor facts remain unavailable.
- [ ] Stable section IDs match this document.
- [ ] Repeating the same idempotency key and input returns the same logical output.
- [ ] Reusing the key with different input returns `409`.
- [ ] Catalog-backed agent identities are used wherever an agent is named.
- [ ] Existing `CREATE_TASK`, `SCHEDULE_MEETING`, and refinement tests continue to pass.
