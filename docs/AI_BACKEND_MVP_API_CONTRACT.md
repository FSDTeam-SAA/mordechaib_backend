# AI Backend MVP API Contract

## Purpose

This is the final handoff for the current Main Backend and AI Backend
meeting, call, and CEO chat analysis MVP. It is based on the Main Backend
ai-integration, ai-actions, message, and meeting-bot implementation, plus the
supplied AI service route documents.

Required ownership:

```text
Transcript complete
 -> Main Backend queue
 -> AI Backend returns analysis JSON
 -> Main Backend stores drafts/proposals
 -> Frontend CEO clarification or approval
 -> Main Backend executes Task/Meeting
```

AI Backend must never create a Main Backend Task, Meeting, Calendar event, CRM record, approval, or proposal. It returns JSON only.

## Readiness verdict

The Main Backend source-analysis integration is structurally ready, but the
supplied AI route contract is not compatible yet. Dynamic agent catalog
synchronization is implemented on the Main Backend side. The AI Backend must
implement the catalog bootstrap consumer and incremental event endpoint in
section 0 before dynamic agents are E2E-ready.

| Priority                    | Required change                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Blocker                     | Update /api/v1/ai/jobs/analyze-source to return top-level requestId and actions.                         |
| Blocker                     | Remove submitted_proposals and all Main Backend write callbacks.                                         |
| Blocker                     | Accept and analyze inline context.                                                                       |
| Blocker                     | Add /api/v1/ai/actions/refine.                                                                           |
| Blocker                     | Emit only CREATE_TASK and SCHEDULE_MEETING actions in this MVP.                                          |
| Required                    | Use strict ISO-8601 datetimes or ask clarification.                                                      |
| Required                    | Use the Main Backend supplied effective IANA timezone; never hard-code `Asia/Dhaka`.                     |
| Required                    | Preserve actionId and action type during refinement.                                                     |
| Required for dynamic agents | AI Backend must bootstrap and persist the Main Backend agent catalog described in section 0.             |
| Required for dynamic agents | AI Backend must idempotently consume agent upsert/disable/activate events and assign only active agents. |
| Optional later              | Add execution-result feedback from Main Backend to AI Backend.                                           |

## Authentication

Main Backend-to-AI Backend gateway routes are called with:

```http
x-ai-actions-secret: <AI_SERVICE_SHARED_SECRET>
Content-Type: application/json
```

The same secret also authenticates the AI Backend catalog-bootstrap request to
the Main Backend. These service-to-service routes do not use frontend JWTs.
Both services must reject a missing or incorrect secret and must never expose
the secret to the frontend.

## Main Backend wire conventions

Main Backend sends these source types:

```text
CALL_AUDIO
CALL_TRANSCRIPT
ZOOM_MEETING
GOOGLE_MEET
USER_MESSAGE
```

### Canonical `source.id`

The Main Backend creates and owns every `source.id`. The AI Backend must treat
it as an opaque identifier, use it for correlation/idempotency, and echo it
unchanged in the response. The AI Backend must not replace it with a provider
ID or generate a new source ID.

| `source.type`     | Canonical `source.id`                                                                                   | Set when                                                         | IDs that must not replace it                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GOOGLE_MEET`     | Main Backend `meeting_bots._id`                                                                         | The completed Google Meet transcript is queued for analysis.     | Google event ID, Meet code/URL, Recall recording ID, transcript ID |
| `ZOOM_MEETING`    | Main Backend meeting document `_id` (`meeting_bots._id`; legacy Zoom flow may send `zoom_meetings._id`) | The completed Zoom transcript is queued for analysis.            | Zoom meeting number/UUID, Recall recording ID, transcript ID       |
| `CALL_TRANSCRIPT` | Main Backend `call_recordings._id`                                                                      | Twilio recording transcription completes and analysis is queued. | Twilio `CallSid`, `RecordingSid`, transcript ID                    |
| `CALL_AUDIO`      | Main Backend `call_recordings._id`                                                                      | A call audio analysis job is explicitly queued.                  | Twilio `CallSid`, `RecordingSid`, audio filename/URL               |
| `USER_MESSAGE`    | Main Backend `messages._id`                                                                             | The CEO's text or attachment message is stored and queued.       | `conversationId`, `clientMessageId`, attachment ID                 |

Provider identifiers remain available only as metadata inside `context`, for
example `context.call.callSid` and `context.call.recordingSid`. For a user
message, `context.conversationId` groups multiple messages but is not the
source ID; every analyzed message keeps its own `messages._id`.

Example source objects:

```json
{
  "meeting": {
    "type": "ZOOM_MEETING",
    "id": "66cc9bdfa847ea856c7b41d2"
  },
  "call": {
    "type": "CALL_TRANSCRIPT",
    "id": "66cc9bdfa847ea856c7b41d3"
  },
  "message": {
    "type": "USER_MESSAGE",
    "id": "66cc9bdfa847ea856c7b41d4"
  }
}
```

Main Backend creates a deterministic job identifier:

```text
requestId = source-{sourceType lowercase}-{sourceId}
```

AI Backend should echo the request jobId as response requestId.

Examples:

```text
source-zoom_meeting-66cc9bdfa847ea856c7b41d2
source-call_transcript-66cc9bdfa847ea856c7b41d3
source-user_message-66cc9bdfa847ea856c7b41d4
```

The unique analysis identity is the combination of `source.type` and
`source.id`. Retries for that same source reuse the same `jobId`,
`idempotencyKey`, and response `requestId`.

### Agent ownership and identity

The Main Backend does not choose or assign an AI agent. The AI Backend master
agent/orchestrator owns routing to the active agents in its synchronized local
catalog. Therefore the analyze-source request has no `agent` field.

Every action returned by the AI Backend must identify the specialist agent
that produced or owns that action:

```json
{
  "id": "66cc9bdfa847ea856c7b41a1",
  "name": "Layla",
  "type": "OPERATIONS"
}
```

`id` is the string form of the Main Backend `agents._id` MongoDB ObjectId.
`name` is display metadata and `type` is the agent category. Send the wire key
`id` (not `agentId`) and echo the exact ID received through catalog sync. The
AI Backend must never generate an agent ID or substitute a display name.

Valid types are `SALES`, `OPERATIONS`, `SUPPORT`, `MARKETING`, `STRATEGY`,
`CHIEF_OF_STAFF`, `DESIGN`, and `CUSTOM`. A new agent can be added at runtime
with any of these types without changing Main Backend code. A genuinely new
category such as `LEGAL` still requires a Main Backend enum/schema change and
deployment; use `CUSTOM` until a separate database-backed type registry is
introduced.

The proposal and executed Task/Meeting store `id`, `name`, and `type` as a
historical snapshot. Updating or disabling the catalog record must not rewrite
old proposal or execution history.

## 0. Agent catalog synchronization

### Ownership model

```text
Main Backend agents collection = source of truth
AI Backend persistent local catalog = synchronized read model
```

The AI Backend uses its local catalog during orchestration and does not query
the Main Backend for every analysis request. "Local" must mean a durable AI
Backend database or Redis-backed store; process memory alone is insufficient
because a restart would remove all agent assignments.

The catalog key is agent `id`:

```text
agents._id
```

Agent IDs may differ between development, staging, and production. Each AI
Backend deployment must synchronize only with its matching Main Backend
environment.

### 0.1 Initial bootstrap and reconciliation

The AI Backend calls this Main Backend endpoint at startup and periodically for
reconciliation:

```http
GET {MAIN_BACKEND_URL}/api/v1/ai-internal/agents?limit=100&cursor=<opaque-cursor>
x-ai-actions-secret: <AI_SERVICE_SHARED_SECRET>
```

This Main Backend endpoint is implemented. It is service-authenticated,
cursor-paginated, and does not use a frontend bearer token. Its normal Main
Backend response envelope is:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "66cc9bdfa847ea856c7b41a1",
        "name": "Layla",
        "imageUrl": "https://cdn.example.com/agents/layla.png",
        "type": "OPERATIONS",
        "status": "ACTIVE",
        "version": 3,
        "updatedAt": "2026-09-12T10:00:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

`limit` must be bounded and `cursor` must be treated as opaque. The AI Backend
must continue until `nextCursor` is `null`, then reconcile its local catalog:

- insert agents that are missing locally;
- replace an older local record with the higher `version`;
- retain disabled records for identity/history but exclude them from routing;
- mark a local record stale only after a complete successful reconciliation,
  never after a partial or failed page request.

### 0.2 Incremental agent events

After the initial bootstrap, Main Backend sends changes to this AI Backend
endpoint:

```http
POST {AI_SERVICE_URL}/api/v1/ai/agents/events
x-ai-actions-secret: <AI_SERVICE_SHARED_SECRET>
Content-Type: application/json
```

Upsert example for create or profile update:

```json
{
  "schemaVersion": "1.0",
  "eventId": "agent-66cc9bdfa847ea856c7b41a1-v3",
  "eventType": "AGENT_UPSERTED",
  "agent": {
    "id": "66cc9bdfa847ea856c7b41a1",
    "name": "Layla",
    "imageUrl": "https://cdn.example.com/agents/layla.png",
    "type": "OPERATIONS",
    "status": "ACTIVE",
    "version": 3
  },
  "occurredAt": "2026-09-12T10:00:00.000Z"
}
```

Disable or reactivate example:

```json
{
  "schemaVersion": "1.0",
  "eventId": "agent-66cc9bdfa847ea856c7b41a1-v4",
  "eventType": "AGENT_DISABLED",
  "agent": {
    "id": "66cc9bdfa847ea856c7b41a1",
    "name": "Layla",
    "imageUrl": "https://cdn.example.com/agents/layla.png",
    "type": "OPERATIONS",
    "status": "DISABLED",
    "version": 4
  },
  "occurredAt": "2026-09-12T10:05:00.000Z"
}
```

Allowed `eventType` values are `AGENT_UPSERTED`, `AGENT_DISABLED`, and
`AGENT_ACTIVATED`. Physical delete is not part of this contract. The frontend
"delete" operation must set `status: DISABLED`; reactivation keeps the same
MongoDB `_id` and sends `AGENT_ACTIVATED`.

Required AI Backend acknowledgement:

```json
{
  "eventId": "agent-66cc9bdfa847ea856c7b41a1-v4",
  "accepted": true
}
```

AI Backend processing rules:

- authenticate before reading the event body;
- make `eventId` idempotent so Main Backend retries are safe;
- ignore an event whose agent `version` is lower than or equal to the locally
  applied version, while still returning `accepted: true`;
- key agents by `agent.id`;
- never route work to `DISABLED` agents;
- never automatically create a new agent from an analysis response;
- preserve the latest catalog record across process restarts.

Main Backend delivery is asynchronous through its durable BullMQ AI jobs queue
with retry and exponential backoff. A temporary AI Backend outage does not make
the frontend agent create/update/disable request fail. If an event cannot be
queued because Redis itself is unavailable, Main Backend keeps the committed
agent change and the next bootstrap/reconciliation repairs the AI catalog.

### 0.3 Proposal validation rule

For every action, the AI Backend must select an `ACTIVE` agent from the global
local catalog and return its exact `id` with the locally known `name` and
`type`. Main Backend verifies the returned ObjectId is a global active agent
before accepting a new proposal. The MongoDB ID is authoritative: Main Backend
replaces response name/type metadata with its current catalog values before
persistence. This safely handles a profile rename while an older
synchronization event is still in flight.

If the AI Backend has no suitable active agent, it must return no executable
action for that recommendation; it must not invent an identity or reuse a
disabled agent. Historical proposals from a subsequently disabled agent remain
valid snapshots, but a new proposal from that disabled agent must be rejected.

### 0.4 Main Backend implementation status

| Area                 | Implemented behavior                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent identity       | Uses the string form of MongoDB `agents._id`; no second semantic ID is required.                                                                                          |
| Agent lifecycle      | New records default to `ACTIVE`; `PATCH /agents/:id` accepts `ACTIVE` or `DISABLED`.                                                                                      |
| Delete               | `DELETE /agents/:id` is idempotent soft disable and never physically removes the record.                                                                                  |
| Versioning           | Every effective create/update/disable operation carries a monotonic agent `version`; legacy records are exposed as version 1 and move to version 2 on their first change. |
| Bootstrap            | `GET /api/v1/ai-internal/agents` returns the service-authenticated, cursor-paginated global catalog.                                                                      |
| Change delivery      | Create/update/disable/activate queues the section 0.2 event through BullMQ without waiting for the AI HTTP response.                                                      |
| Proposal validation  | A new proposal must reference an active global agent; Main Backend persists canonical name/type from its catalog.                                                         |
| Historical integrity | Clarification preserves the original agent snapshot; disabling an agent does not rewrite old proposals, Tasks, or Meetings.                                               |

The remaining dynamic-agent integration work is owned by the AI Backend: it
must implement `POST /api/v1/ai/agents/events`, persist the local read model,
and run startup/periodic bootstrap against the Main Backend catalog endpoint.

Frontend agent management continues to call only the Main Backend:

Only a platform `ADMIN` can create, update, disable, or reactivate an agent.
The existing Main Backend platform-admin guard (`isPlatformAdmin: true`) is
enforced for these writes. An `OWNER` (the organizer) has read-only access to
the global catalog and cannot change agent records.

```text
POST   /api/v1/agents
GET    /api/v1/agents?status=ACTIVE&type=OPERATIONS&page=1&limit=20
GET    /api/v1/agents/:id
PATCH  /api/v1/agents/:id        body: { "status": "DISABLED" | "ACTIVE" }
DELETE /api/v1/agents/:id        idempotent alias for soft disable
```

The frontend must never call the internal catalog endpoint or the AI Backend
event endpoint directly.

## 1. Analyze source

### Route

```http
POST {AI_SERVICE_URL}/api/v1/ai/jobs/analyze-source
```

The route already exists in the AI documentation, but its request handling and response must follow this document.

### Request

```json
{
  "schemaVersion": "1.0",
  "jobId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "idempotencyKey": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "organizationId": "66cc9bdfa847ea856c7b41d1",
  "source": {
    "type": "ZOOM_MEETING",
    "id": "66cc9bdfa847ea856c7b41d2"
  },
  "context": {
    "organizationId": "66cc9bdfa847ea856c7b41d1",
    "source": {
      "type": "ZOOM_MEETING",
      "id": "66cc9bdfa847ea856c7b41d2"
    },
    "occurredAt": "2026-09-10T09:30:00.000Z",
    "organization": {
      "organizationId": "66cc9bdfa847ea856c7b41d1",
      "name": "Example Ltd.",
      "timezone": "Asia/Dhaka",
      "language": "en",
      "industry": "Software",
      "businessSize": "SMALL",
      "businessHours": {}
    },
    "requester": {
      "userId": "66cc9bdfa847ea856c7b41d5",
      "name": "Rifat Hossain",
      "timezone": "America/New_York",
      "language": "en"
    },
    "effectiveTimezone": "America/New_York",
    "meeting": {
      "platform": "ZOOM",
      "participants": ["Customer", "Account Executive"],
      "transcriptAvailable": true
    },
    "transcript": {
      "text": "Customer: Please send the revised proposal tomorrow.",
      "segments": [],
      "wordCount": 8,
      "languageCode": "auto"
    }
  },
  "generatedAt": "2026-09-10T10:00:00.000Z"
}
```

context is bounded data prepared by Main Backend. AI must use it directly and must not call a removed Main Backend context route or request provider credentials.

`context.requester` is present when the source has an identifiable Main
Backend user, such as the meeting organizer or CEO message sender. The Main
Backend resolves `context.effectiveTimezone` in this order:

1. requester's valid IANA timezone;
2. organization's valid IANA timezone.

Call sources that have no requester use the organization timezone. The AI
Backend must use `effectiveTimezone` as the default interpretation timezone
for natural-language dates. It must never hard-code `Asia/Dhaka`, UTC, or its
server timezone. If the transcript explicitly names another timezone, that
explicit timezone may be used for that action.

For `USER_MESSAGE`, the context also contains a bounded conversation history,
active pending proposals, and attachment metadata. Message attachment entries
may include a short-lived `downloadUrl` (typically five minutes). The AI
service may fetch that URL during the request to transcribe audio or extract
PDF/document content; it must not persist or expose the URL. If the AI service
cannot process an attachment, it should return a clarification action rather
than guessing.

### Required response

Return raw JSON, not a success/data envelope.

```json
{
  "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "source": {
    "type": "ZOOM_MEETING",
    "id": "66cc9bdfa847ea856c7b41d2"
  },
  "actions": [
    {
      "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-task-001",
      "actionType": "CREATE_TASK",
      "proposedByAgent": {
        "id": "66cc9bdfa847ea856c7b41a1",
        "name": "Layla",
        "type": "OPERATIONS"
      },
      "payload": {
        "title": "Send revised proposal",
        "description": "Send the revised proposal to the customer.",
        "priority": "HIGH",
        "dueDate": "2026-09-11T10:00:00.000Z",
        "tags": ["follow-up", "quotation"]
      },
      "confidence": 0.94,
      "evidence": [
        {
          "text": "Customer: Please send the revised proposal tomorrow.",
          "speaker": "Customer",
          "startTimeSeconds": 120,
          "endTimeSeconds": 126
        }
      ]
    },
    {
      "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-meeting-001",
      "actionType": "SCHEDULE_MEETING",
      "proposedByAgent": {
        "id": "66cc9bdfa847ea856c7b41a1",
        "name": "Layla",
        "type": "OPERATIONS"
      },
      "payload": {
        "platform": "ZOOM",
        "title": "Project follow-up meeting",
        "agenda": "Review the quotation and project next steps.",
        "startsAt": "2026-09-15T19:00:00.000Z",
        "durationMinutes": 30,
        "timezone": "America/New_York",
        "invitees": [],
        "reminderMinutesBeforeStart": 15,
        "sendBot": true
      },
      "confidence": 0.88,
      "evidence": []
    }
  ],
  "analysis": {
    "summary": "The customer requested a revised quotation and a follow-up meeting.",
    "overallConfidence": 0.91,
    "sentimentAnalysis": {
      "score": {
        "positive": 40,
        "neutral": 50,
        "negative": 10
      }
    },
    "customerIntelligence": {
      "healthScore": 80,
      "riskLevel": "LOW"
    },
    "patternDetection": {
      "followUpRequests": 80
    },
    "classifiedSegments": [
      {
        "id": "segment-commitment-1",
        "category": "COMMITMENT",
        "text": "Please send the revised proposal tomorrow.",
        "speaker": "Customer",
        "startTimeSeconds": 120,
        "endTimeSeconds": 126,
        "confidence": 0.94
      }
    ]
  }
}
```

`analysis` is required for this MVP. Main Backend stores the complete result
once in `ai_source_analyses`, even when `actions` is empty. Proposals retain
only the compact sentiment, customer health/risk and pattern snapshot for
backward-compatible proposal views; summary and classified transcript data are
not duplicated across proposals.

The required analysis container and core fields are:

```json
{
  "summary": "The customer requested a revised quotation and a follow-up meeting.",
  "overallConfidence": 0.91,
  "sentimentAnalysis": {
    "score": { "positive": 40, "neutral": 50, "negative": 10 }
  },
  "customerIntelligence": {
    "healthScore": 80,
    "riskLevel": "LOW"
  },
  "patternDetection": {
    "followUpRequests": 80
  },
  "classifiedSegments": []
}
```

`sentimentAnalysis.score`, `customerIntelligence.healthScore`, and
`customerIntelligence.riskLevel` are required. `patternDetection` is required
as an object, but each of these signals is individually optional:

```text
valueProposition
pricingObjection
budgetApproval
marketTrends
followUpRequests
```

Return only signals the AI could meaningfully evaluate. An empty object is
valid when no pattern could be evaluated. A missing signal means “not
evaluated/not enough evidence”; `0` means the signal was evaluated and was not
detected. All provided scores must be numbers from 0 to 100. Main Backend does
not fill missing signals with zero and normalizes
`customerIntelligence.riskLevel` to uppercase before persistence.

For the Call Intelligence details page, AI should return:

| Field                             | Rules                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `summary`                         | Plain-text source summary, maximum 10,000 characters.                                                                  |
| `overallConfidence`               | Number from `0` to `1`. If omitted during rollout, Main Backend derives the mean action confidence when actions exist. |
| `classifiedSegments`              | Maximum 500 unique transcript insights. May be empty.                                                                  |
| `classifiedSegments[].category`   | `OBJECTION`, `COMMITMENT`, or `ACTION_ITEM`.                                                                           |
| `classifiedSegments[].text`       | Required, maximum 5,000 characters.                                                                                    |
| `classifiedSegments[].confidence` | Optional number from `0` to `1`.                                                                                       |

`ALL` is a frontend transcript filter, not a stored category. The raw
transcript supplies the All tab.

### Action rules

| Field                  | Rule                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| requestId              | Echo request `jobId` exactly; required, max 200 characters. A mismatch is rejected.                                                                       |
| source                 | Echo request source type and ID exactly. A missing or changed source is rejected.                                                                         |
| actions                | Each item becomes one independent proposal.                                                                                                               |
| actionId               | Required, non-empty, maximum 128 characters, unique within requestId, stable on retry.                                                                    |
| actionType             | Only CREATE_TASK or SCHEDULE_MEETING.                                                                                                                     |
| proposedByAgent.id     | Exact Main Backend `agents._id` received from global catalog sync; must be an active MongoDB ObjectId string.                                             |
| proposedByAgent.name   | Required local-catalog display name, for example Layla; Main Backend persists its canonical current value.                                                |
| proposedByAgent.type   | Required category: SALES, OPERATIONS, SUPPORT, MARKETING, STRATEGY, CHIEF_OF_STAFF, DESIGN, or CUSTOM; Main Backend persists its canonical current value. |
| payload                | JSON object validated by Main Backend.                                                                                                                    |
| confidence             | Number from 0 to 1.                                                                                                                                       |
| evidence               | Optional; each item requires text.                                                                                                                        |
| clarificationQuestions | Optional; maximum 10 unique questions.                                                                                                                    |

`proposedByAgent` is selected by the AI Backend master agent for each action;
it is never supplied or assigned by the Main Backend. Multiple actions in one
response may have different `proposedByAgent` values. The AI Backend obtains
the available identities from section 0's synchronized catalog.

If clarificationQuestions is present, Main Backend stores NEEDS_CLARIFICATION; otherwise it validates the payload and stores PENDING.

### Multiple actions

Five AI actions produce five independent proposals:

```text
proposalId = requestId + ":" + actionId
```

Each can be separately tracked, clarified, approved, rejected, executed, or failed. The MVP has no bulk approval route.

## 2. Action payload rules

### CREATE_TASK

payload.title is required. Supported optional fields:

```text
description, assignedToUserId, department, priority, dueDate,
estimatedDurationMinutes, stakeholderIds, dependencies, requiredAttachments,
reminder, subtasks, tags
```

Use priority values LOW, MEDIUM, HIGH; department values SALES, FINANCE, OPERATIONS, SUPPORT, DESIGN, MARKETING, OTHER. dueDate must be strict ISO-8601.

### SCHEDULE_MEETING

A ready meeting requires:

```json
{
  "platform": "GOOGLE_MEET",
  "title": "Project review",
  "startsAt": "2026-09-15T19:00:00.000Z",
  "durationMinutes": 30,
  "timezone": "America/New_York",
  "invitees": [],
  "sendBot": true
}
```

`platform` must be `ZOOM` or `GOOGLE_MEET`. A ready proposal must contain a
valid IANA `timezone`, such as `America/New_York`, and an absolute `startsAt`
value containing either `Z` or an explicit offset such as `-04:00`. Never send
`September 15`, `tomorrow`, `3 PM`, or `2026-09-15T15:00:00` as `startsAt`.

The Main Backend uses the action's explicit valid timezone first; if it is
omitted, it inserts the previously resolved `context.effectiveTimezone`. Before
persistence, it converts `startsAt` to UTC with `Date.toISOString()`. The IANA
timezone is also retained for display and future scheduling rules. Calendar
providers then display the same instant in each attendee's local timezone.
This fallback is defensive; the AI Backend should still return `timezone` in
every ready `SCHEDULE_MEETING` action.

If the date or time cannot be resolved safely, return a clarification question
instead of guessing. For example, `15 September at 3 PM` plus
`effectiveTimezone: America/New_York` can be resolved; `15 September` without a
time requires clarification.

## 3. Missing clarification route

### Route to add in AI Backend

```http
POST {AI_SERVICE_URL}/api/v1/ai/actions/refine
```

Main Backend calls it after the CEO submits:

```http
POST /api/v1/call-intelligence/proposals/:id/clarifications
```

Request:

```json
{
  "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "proposal": {
    "id": "66dd9bdfa847ea856c7b41d2",
    "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "66cc9bdfa847ea856c7b41a1",
      "name": "Layla",
      "type": "OPERATIONS"
    },
    "source": {
      "type": "ZOOM_MEETING",
      "id": "66cc9bdfa847ea856c7b41d2"
    },
    "payload": {
      "platform": "ZOOM",
      "title": "Project follow-up meeting",
      "timezone": "America/New_York"
    },
    "clarificationQuestions": [
      {
        "id": "meeting-start-time",
        "field": "startsAt",
        "question": "What time should the meeting start?",
        "inputType": "TIME",
        "required": true
      }
    ],
    "clarificationAnswers": {
      "meeting-start-time": "3:00 PM"
    }
  },
  "clarification": {
    "questionId": "meeting-start-time",
    "answer": "3:00 PM"
  }
}
```

Response:

```json
{
  "action": {
    "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-meeting-001",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "66cc9bdfa847ea856c7b41a1",
      "name": "Layla",
      "type": "OPERATIONS"
    },
    "payload": {
      "platform": "ZOOM",
      "title": "Project follow-up meeting",
      "startsAt": "2026-09-15T19:00:00.000Z",
      "durationMinutes": 30,
      "timezone": "America/New_York",
      "invitees": [],
      "sendBot": true
    },
    "confidence": 0.91,
    "evidence": []
  }
}
```

The refined action must preserve the original actionId, actionType, and
`proposedByAgent` snapshot. Refinement continues an existing proposal; it must
not silently reassign the action because the catalog changed after the draft
was created. It may return another clarification list if the answer is still
incomplete. Otherwise Main Backend moves the proposal to PENDING.

## 4. Legacy routes and fields

| Legacy item                           | Decision                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST /api/v1/recordings/analyze       | Keep only for manual/debug analysis; it is not consumed by Main Backend.                                                               |
| analysis.tasks                        | Legacy shape; convert to actions.                                                                                                      |
| submitted_proposals                   | Remove; it belongs to the callback design.                                                                                             |
| backend_result                        | Remove; AI must not execute Main Backend effects.                                                                                      |
| Action-level riskLevel                | Omit. It is not persisted in the MVP action schema; use task `payload.priority` and `customerIntelligence.riskLevel` where applicable. |
| email.draft_message / follow_up_email | Narrative only in this MVP.                                                                                                            |
| CRM actions                           | Not supported in this MVP.                                                                                                             |
| Chief-of-Staff routes                 | Separate feature; not required for meeting proposal E2E.                                                                               |
| Heartbeat/job-event routes            | Optional observability; Main Backend does not consume them.                                                                            |

## 5. Main Backend frontend lifecycle

Frontend calls Main Backend, not AI Backend:

```text
GET  /api/v1/call-intelligence/:sourceId/details?sourceType=GOOGLE_MEET
GET  /api/v1/call-intelligence/:sourceId/report?sourceType=GOOGLE_MEET&format=html
GET  /api/v1/call-intelligence/proposals?status=NEEDS_CLARIFICATION
GET  /api/v1/call-intelligence/proposals/:id
POST /api/v1/call-intelligence/proposals/:id/clarifications
GET  /api/v1/call-intelligence/proposals?status=PENDING
POST /api/v1/call-intelligence/proposals/:id/action
```

The details endpoint returns metadata, audio availability/download path,
source analysis, classified segments, and compact Task/Meeting proposal lists.
It defaults to `includeTranscript=false` for a fast initial response. Set
`includeTranscript=true` only when raw transcript text and segments are needed.
Its `extensions.crm` field is intentionally `null` in this phase and is
reserved for the later CRM/customer-intelligence integration without changing
the rest of the response contract.

```json
{
  "source": { "type": "GOOGLE_MEET", "id": "meeting-bot-id" },
  "metadata": { "kind": "MEETING", "platform": "GOOGLE_MEET" },
  "audio": {
    "available": true,
    "downloadPath": "/api/v1/meeting-bots/meeting-bot-id/audio"
  },
  "transcript": {
    "available": true,
    "included": false,
    "wordCount": 276
  },
  "analysis": {
    "summary": "The customer requested a quotation.",
    "overallConfidence": 0.91,
    "sentimentAnalysis": {},
    "patternDetection": {},
    "classifiedSegments": []
  },
  "actions": {
    "priorityTasks": [],
    "meetingSchedules": [],
    "totals": { "priorityTasks": 0, "meetingSchedules": 0 }
  },
  "extensions": { "crm": null }
}
```

Details filters: `sourceType` is required; `status` defaults to `PENDING`;
`taskLimit` and `meetingLimit` default to `4` and allow `1-20`;
`includeTranscript` defaults to `false`.

Reports support `format=html` and `format=json`. Twilio call audio is available
through the authenticated path returned by the details response; meeting audio
continues through the existing Meeting Bot temporary-download endpoint.

Lifecycle:

```text
complete:   PENDING -> APPROVED -> EXECUTING -> EXECUTED
incomplete: NEEDS_CLARIFICATION -> ANALYZING -> PENDING
             -> NEEDS_CLARIFICATION (if still incomplete)
```

Only Main Backend approval creates the Task or provider Meeting. The approving CEO/Admin is the creator of the resulting resource.

## 6. Optional execution-result route

Not currently called by Main Backend and not required for first E2E draft/approval testing:

```http
POST {AI_SERVICE_URL}/api/v1/ai/actions/execution-results
```

```json
{
  "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "proposalId": "66dd9bdfa847ea856c7b41d2",
  "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-task-001",
  "status": "EXECUTED",
  "target": {
    "type": "TASK",
    "id": "66ee9bdfa847ea856c7b41d2"
  },
  "executedAt": "2026-09-10T10:30:00.000Z"
}
```

## 7. Acceptance checklist

AI Backend is ready when:

- [ ] It bootstraps every page of the Main Backend agent catalog and persists
      the result in durable local storage.
- [ ] `POST /api/v1/ai/agents/events` authenticates requests, applies events
      idempotently, uses the global `agent.id` identity, and ignores stale
      versions.
- [ ] Disabled agents remain in the local catalog for identity/history but are
      excluded from all new orchestration assignments.
- [ ] Every new action uses the exact MongoDB agent ID and current name/type
      from the synchronized global catalog.
- [ ] analyze-source accepts inline context and returns raw requestId, source,
      actions, and required analysis.
- [ ] Response requestId and source echo the submitted jobId and source exactly.
- [ ] It treats Main Backend `source.id` as opaque and echoes `source.type`,
      `source.id`, and `jobId`/`requestId` unchanged.
- [ ] No proposal/task/meeting/approval callback is made to Main Backend.
- [ ] Only CREATE_TASK and SCHEDULE_MEETING actions are emitted.
- [ ] Stable actionId and catalog-backed proposedByAgent.id, name, and type are returned.
- [ ] The master agent selects each action's proposedByAgent; analyze-source
      does not expect an agent assignment from Main Backend.
- [ ] Missing pattern signals are omitted rather than represented as zero.
- [ ] Missing scheduling data creates clarification questions.
- [ ] Meeting time uses context.effectiveTimezone, returns an absolute datetime,
      and never relies on a hard-coded timezone.
- [ ] ai/actions/refine is implemented and preserves action identity/type.
- [ ] Multiple actions from one transcript are tested.
- [ ] A complete task, clarification meeting, and approved provider meeting pass E2E.
