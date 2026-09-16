# AI Backend E2E Contract and Readiness

> **Current MVP handoff:** See [AI_BACKEND_MVP_API_CONTRACT.md](./AI_BACKEND_MVP_API_CONTRACT.md)
> for the consolidated contract and AI Backend implementation checklist.

## Purpose

This is the implementation handoff for the AI Backend team. It compares the
currently deployed/documented AI service contract with the contract that the
current Main Backend actually calls.

The target flow is intentionally one-way for analysis:

```text
Meeting transcript is complete
  -> Main Backend queues analysis
  -> Main Backend POSTs bounded context to AI Backend
  -> AI Backend returns JSON only
  -> Main Backend stores proposal drafts
  -> Frontend collects CEO clarification/approval
  -> Main Backend alone creates the Task or provider Meeting
```

The AI Backend must not call a Main Backend write endpoint and must not create
tasks, meetings, calendar events, or approvals itself.

## Readiness verdict

The Main Backend is ready to enqueue a completed Google Meet or Zoom transcript
and persist a draft **when the AI Backend implements the contract in this
document**. The two services are **not E2E-compatible yet** with the currently
documented AI routes.

The blocking differences are:

| Priority | Area | Current AI behavior/documentation | Required behavior |
| --- | --- | --- | --- |
| Blocker | Analyze response | Returns `job_id`, `analysis`, and `submitted_proposals` | Return top-level `requestId` and `actions` exactly as described below |
| Blocker | Proposal persistence | `submitted_proposals` indicates the AI service posts proposals back to Main Backend | Do not call any Main Backend write API; return actions in the HTTP response only |
| Blocker | Source input | AI documentation does not define or consume the inline `context` object | Analyze the supplied bounded context; do not fetch a removed Main Backend context route |
| Blocker | Clarification | No documented `POST /api/v1/ai/actions/refine` endpoint | Implement the refinement endpoint and return one revised action |
| Blocker | Action vocabulary | AI returns tool recommendations such as `email.draft_message` and `calendar.create_event` | Return only `CREATE_TASK` or `SCHEDULE_MEETING` in `actions` for this MVP |
| Required | Meeting date/time | AI can return natural language such as `September 15` | Return a complete future ISO-8601 `startsAt`, or a clarification question; never return a natural-language date in an executable payload |

## Ownership and security

| Component | Owner | Responsibility |
| --- | --- | --- |
| Meeting/Recall webhook, transcript storage, queue and proposal database | Main Backend | Receives a transcript and controls persistence |
| Transcript interpretation, action extraction and follow-up questions | AI Backend | Produces safe recommendation JSON only |
| Draft/clarification/approval UI | Frontend | Presents Main Backend data and sends CEO decisions to Main Backend |
| Creating Tasks and provider Meetings | Main Backend | Performs the side effect after final CEO approval |

All Main Backend-to-AI Backend requests use:

```http
x-ai-actions-secret: <AI_SERVICE_SHARED_SECRET>
Content-Type: application/json
```

The shared-secret value must be identical in both deployments. The AI Backend
does not need a user JWT or Main Backend provider credentials.

## 1. Analyze a completed source

### Endpoint the Main Backend calls

```http
POST {AI_SERVICE_URL}/api/v1/ai/jobs/analyze-source
```

The Main Backend currently has a 30-second timeout and retries failed queue
jobs up to six times with exponential backoff. The endpoint must respond with
JSON and should be idempotent for the same `jobId`/`idempotencyKey`.

### Request actually sent by the Main Backend

```json
{
  "schemaVersion": "1.0",
  "jobId": "source-google_meet-66cc9bdfa847ea856c7b41d2",
  "idempotencyKey": "source-google_meet-66cc9bdfa847ea856c7b41d2",
  "organizationId": "66cc9bdfa847ea856c7b41d1",
  "source": {
    "type": "GOOGLE_MEET",
    "id": "66cc9bdfa847ea856c7b41d2"
  },
  "context": {
    "organizationId": "66cc9bdfa847ea856c7b41d1",
    "source": {
      "type": "GOOGLE_MEET",
      "id": "66cc9bdfa847ea856c7b41d2"
    },
    "occurredAt": "2026-09-10T09:30:00.000Z",
    "meeting": {
      "platform": "GOOGLE_MEET",
      "participants": ["Customer", "Account Executive"],
      "transcriptAvailable": true
    },
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
    "transcript": {
      "text": "Customer: Please send the quotation...",
      "segments": [],
      "wordCount": 276,
      "languageCode": "auto"
    }
  },
  "generatedAt": "2026-09-10T10:00:00.000Z"
}
```

Supported source types are `CALL_AUDIO`, `CALL_TRANSCRIPT`, `ZOOM_MEETING`,
`GOOGLE_MEET`, and `USER_MESSAGE`. For meeting E2E testing, Main Backend uses
the MongoDB Meeting Bot ID for `source.id`; it is not a Zoom meeting number,
Google event ID, Recall recording ID, or transcript ID.

`context.transcript` can be `null` only for a source that is not ready for
analysis. For the transcript-complete queue trigger, it is populated. The AI
Backend must use the provided text/segments rather than calling an old
`/ai/internal/*` or proposal-intake route.

### Required success response

The response must be a raw JSON object, not `{ "success": true, "data": ... }`.

```json
{
  "requestId": "source-google_meet-66cc9bdfa847ea856c7b41d2",
  "source": {
    "type": "GOOGLE_MEET",
    "id": "66cc9bdfa847ea856c7b41d2"
  },
  "actions": [
    {
      "actionId": "task-send-quotation",
      "actionType": "CREATE_TASK",
      "proposedByAgent": {
        "id": "sales-agent",
        "name": "Sales Agent",
        "type": "SALES"
      },
      "payload": {
        "title": "Send quotation for the new order",
        "description": "Send the agreed quotation after the meeting.",
        "priority": "HIGH",
        "tags": ["follow-up", "quotation"]
      },
      "confidence": 0.92,
      "evidence": [
        {
          "text": "I am going to send the quotation later.",
          "speaker": "Account Executive",
          "startTimeSeconds": 120,
          "endTimeSeconds": 124
        }
      ]
    },
    {
      "actionId": "meeting-project-review",
      "actionType": "SCHEDULE_MEETING",
      "proposedByAgent": {
        "id": "operations-agent",
        "name": "Operations Agent",
        "type": "OPERATIONS"
      },
      "payload": {
        "platform": "GOOGLE_MEET",
        "title": "Project review meeting",
        "agenda": "Review quotation, project progress, and live-server issues.",
        "timezone": "America/New_York"
      },
      "clarificationQuestions": [
        {
          "id": "meeting-start-time",
          "field": "startsAt",
          "question": "What time should the 15 September project review start?",
          "inputType": "TIME",
          "required": true
        }
      ],
      "confidence": 0.86,
      "evidence": [
        {
          "text": "We will join the next meeting on 15 September."
        }
      ]
    }
  ],
  "analysis": {
    "summary": "The customer requested a quotation and a follow-up meeting.",
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
    "classifiedSegments": [
      {
        "id": "segment-commitment-1",
        "category": "COMMITMENT",
        "text": "I am going to send the quotation later.",
        "speaker": "Account Executive",
        "startTimeSeconds": 120,
        "endTimeSeconds": 124,
        "confidence": 0.94
      }
    ]
  }
}
```

For every action, Main Backend requires:

| Field | Rules |
| --- | --- |
| `actionId` | Non-empty, maximum 128 characters, unique and stable inside the same `requestId`. Reuse it unchanged on retries. |
| `actionType` | Exactly `CREATE_TASK` or `SCHEDULE_MEETING`. |
| `proposedByAgent.id` / `.name` / `.type` | Stable ID, display name, and valid agent type. Use IDs such as `sales-agent`, not presentation-only names. |
| `payload` | JSON object. It is validated before a draft becomes executable. |
| `confidence` | Number from `0` to `1`. |
| `evidence` | Optional; every item needs `text` (max 5,000 chars). `segmentId`, `speaker`, `startTimeSeconds`, and `endTimeSeconds` are optional. |
| `clarificationQuestions` | Optional maximum 10 items. Each needs unique `id` (max 128), `field` (max 200), and `question` (max 2,000). |

If `clarificationQuestions` is non-empty, Main Backend stores the proposal as
`NEEDS_CLARIFICATION` and permits an incomplete payload. If it is empty, the
payload must already be valid and the proposal becomes `PENDING` for CEO
approval.

The Main Backend does not send or select an agent. The AI Backend master agent
assigns each action to a specialist and returns that identity in
`proposedByAgent`. Pattern signals are individually optional: omitted means
not evaluated or insufficient evidence, while `0` means evaluated and not
detected. `patternDetection: {}` is valid.

For the details page, AI should also provide `analysis.summary`,
`analysis.overallConfidence`, and `analysis.classifiedSegments`. Valid segment
categories are `OBJECTION`, `COMMITMENT`, and `ACTION_ITEM`. Main Backend stores
these once per source rather than copying large transcript insights into every
proposal.

## 2. Supported action payloads

### `CREATE_TASK`

`title` is mandatory. Valid optional fields are:

```text
description, assignedToUserId, department, priority, dueDate,
estimatedDurationMinutes, stakeholderIds, dependencies, requiredAttachments,
reminder, subtasks, tags
```

Important values:

| Field | Valid values / format |
| --- | --- |
| `priority` | `LOW`, `MEDIUM`, `HIGH` |
| `department` | `SALES`, `FINANCE`, `OPERATIONS`, `SUPPORT`, `DESIGN`, `MARKETING`, `OTHER` |
| `dueDate` | Strict ISO-8601 datetime, for example `2026-09-15T10:00:00.000Z` |
| `assignedToUserId` | Optional MongoDB user ID belonging to the same organization. Do not guess an ID. |

Unknown fields are rejected for a ready proposal. For an unknown task owner or
due date, ask a clarification instead of inventing a value.

### `SCHEDULE_MEETING`

For a ready (no clarification) meeting proposal, Main Backend requires:

```json
{
  "platform": "ZOOM",
  "title": "Project review",
  "startsAt": "2026-09-15T19:00:00.000Z",
  "timezone": "America/New_York"
}
```

Recommended complete payload:

```json
{
  "platform": "ZOOM",
  "title": "Project review",
  "agenda": "Review project progress and next steps.",
  "startsAt": "2026-09-15T19:00:00.000Z",
  "durationMinutes": 30,
  "timezone": "America/New_York",
  "invitees": ["customer@example.com"],
  "reminderMinutesBeforeStart": 15,
  "sendBot": true,
  "botName": "Noltra AI Notetaker"
}
```

| Field | Rules |
| --- | --- |
| `platform` | Exactly `ZOOM` or `GOOGLE_MEET` |
| `title` | Required, 1-200 characters |
| `startsAt` | Required for ready proposal; absolute ISO-8601 with `Z` or an explicit offset, normalized to UTC before persistence, and in the future when approved |
| `timezone` | Required for a ready proposal; valid IANA timezone, for example `America/New_York` |
| `durationMinutes` | Optional integer `1-1440`; backend default is used if omitted |
| `invitees` | Optional valid email addresses, maximum 100 |
| `reminderMinutesBeforeStart` | Optional integer `0-40320` |
| `sendBot` | Optional boolean, defaults to `true` |

Do not put `"September 15"`, `"3 PM"`, or any other natural-language value
in `startsAt`. If the date or time is uncertain, place only known values in
`payload` and return a clarification question. The follow-up response must
return the resolved ISO datetime.

Main Backend sends `context.effectiveTimezone`, resolved from requester
timezone first and organization timezone second. The AI Backend must use it
when resolving an unambiguous local date/time and must not hard-code
`Asia/Dhaka`, UTC, or its server timezone. An explicitly named timezone in the
source may override it for that action. If the date or time remains ambiguous,
the AI Backend must ask for clarification.

## 3. Clarification refinement endpoint

### Endpoint the Main Backend calls

```http
POST {AI_SERVICE_URL}/api/v1/ai/actions/refine
```

This endpoint is missing from the supplied AI service route document and is a
blocker for multi-turn meeting scheduling.

### Request

```json
{
  "requestId": "source-google_meet-66cc9bdfa847ea856c7b41d2",
  "proposal": {
    "id": "66dd9bdfa847ea856c7b41d2",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "operations-agent",
      "name": "Operations Agent",
      "type": "OPERATIONS"
    },
    "source": {
      "type": "GOOGLE_MEET",
      "id": "66cc9bdfa847ea856c7b41d2"
    },
    "payload": {
      "platform": "GOOGLE_MEET",
      "title": "Project review meeting",
      "timezone": "Asia/Dhaka"
    },
    "clarificationQuestions": [
      {
        "id": "meeting-start-time",
        "field": "startsAt",
        "question": "What time should the 15 September project review start?",
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

The `proposal` object is the Main Backend proposal response. AI Backend should
use its existing transcript/run memory keyed by `requestId`, or derive only
from the provided proposal and answer. It must not call Main Backend to fetch
the proposal.

### Required response

```json
{
  "action": {
    "actionId": "meeting-project-review",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "operations-agent",
      "name": "Operations Agent",
      "type": "OPERATIONS"
    },
    "payload": {
      "platform": "GOOGLE_MEET",
      "title": "Project review meeting",
      "agenda": "Review quotation, project progress, and live-server issues.",
      "startsAt": "2026-09-15T15:00:00.000Z",
      "durationMinutes": 30,
      "timezone": "Asia/Dhaka",
      "invitees": [],
      "sendBot": true
    },
    "confidence": 0.9,
    "evidence": []
  }
}
```

The refined action must keep the same action type. It may return another
`clarificationQuestions` array when more CEO input is required; otherwise,
Main Backend validates it and changes the proposal to `PENDING`.

## 4. Legacy AI output mapping

The existing AI direct-analysis output is not a valid Main Backend proposal
response. For example, this legacy item:

```json
{
  "name": "Schedule next project meeting for September 15",
  "type": "meeting",
  "agent_name": "operations_agent",
  "tool_name": "calendar.create_event",
  "required_body": {
    "start_time": "September 15"
  }
}
```

must become either a clarification draft:

```json
{
  "actionId": "meeting-next-project-review",
  "actionType": "SCHEDULE_MEETING",
  "proposedByAgent": { "id": "operations-agent", "name": "Operations Agent", "type": "OPERATIONS" },
  "payload": {
    "platform": "GOOGLE_MEET",
    "title": "Project progress and next-stage meeting",
    "timezone": "Asia/Dhaka"
  },
  "clarificationQuestions": [
    {
      "id": "meeting-start-time",
      "field": "startsAt",
      "question": "What time should the 15 September meeting start?"
    }
  ],
  "confidence": 0.85
}
```

or a ready meeting action only after the AI has an unambiguous full datetime.

| Existing AI tool/type | Main Backend MVP handling |
| --- | --- |
| `tasks.create_task`, `regular_task` | Convert to `CREATE_TASK` |
| `calendar.create_event`, `meeting` | Convert to `SCHEDULE_MEETING` only when payload satisfies this document; otherwise ask a clarification |
| `email.draft_message`, `follow_up_email` | Do not include in `actions` yet. Return it in AI narrative/internal analysis only. |
| CRM update, lead/deal update | Do not include in `actions` yet. CRM action support is out of this MVP. |
| `submitted_proposals` | Remove. It belongs to the old callback design. |

## 5. Frontend contract and observable states

Frontend talks only to Main Backend with CEO/Owner/Admin authentication.

The optimized details endpoint is:

```http
GET /api/v1/call-intelligence/:sourceId/details
  ?sourceType=GOOGLE_MEET
  &status=PENDING
  &taskLimit=4
  &meetingLimit=4
  &includeTranscript=false
```

It aggregates metadata, audio availability/path, source analysis, and task and
meeting proposals. Raw transcript content is excluded by default so the first
page load stays small; use `includeTranscript=true` when the transcript panel
is opened. `extensions.crm` is currently `null` and is the stable integration
point for future CRM/customer intelligence data.

Reports are downloadable without regenerating AI analysis:

```http
GET /api/v1/call-intelligence/:sourceId/report?sourceType=GOOGLE_MEET&format=html
GET /api/v1/call-intelligence/:sourceId/report?sourceType=GOOGLE_MEET&format=json
```

For Twilio recordings, the authenticated audio route is:

```http
GET /api/v1/call-intelligence/:sourceId/audio?sourceType=CALL_TRANSCRIPT
```

Meeting audio continues to use the `audio.downloadPath` returned by the
details endpoint.

| Main Backend route | Use |
| --- | --- |
| `GET /api/v1/ai-actions/proposals?status=NEEDS_CLARIFICATION` | List questions requiring CEO input |
| `GET /api/v1/ai-actions/proposals?status=PENDING` | List complete drafts ready for final approval |
| `GET /api/v1/ai-actions/proposals/:id` | Open a proposal preview, evidence, questions and status |
| `POST /api/v1/ai-actions/proposals/:id/clarifications` | Send `{ "questionId": "...", "answer": "..." }` |
| `POST /api/v1/ai-actions/proposals/:id/action` | Submit `APPROVE`, `REJECT`, or `RETRY`; rejection also requires `reason` |
| `GET /api/v1/ai-actions/sources/:sourceId/action-center?status=PENDING` | Show compact task/meeting cards after the draft is ready |

Important: Action Center defaults to `PENDING`. Request it with
`status=NEEDS_CLARIFICATION` to receive proposal cards containing
`clarificationQuestions` and `clarificationAnswers`, then refresh or poll until
the refinement changes the status to `PENDING` or again to
`NEEDS_CLARIFICATION`.

Each proposal also contains the source-level AI analysis snapshot returned by
the AI service. This is how frontend proposal details access sentiment,
customer intelligence, and pattern detection in the MVP.

Current proposal lifecycle:

```text
AI response with a complete payload: PENDING -> APPROVED -> EXECUTING -> EXECUTED
AI response with questions:        NEEDS_CLARIFICATION -> ANALYZING -> PENDING
                                                       -> NEEDS_CLARIFICATION
```

`FAILED` is reserved for a Task/Meeting execution failure after CEO approval.
There is currently no persisted source-analysis job status visible to frontend.
Therefore, an AI HTTP failure before an action is returned will be visible in
Main Backend worker logs/BullMQ but will not create a draft card. This is not a
contract blocker, but a production observability improvement to plan next.

## 6. Execution-result feedback is still absent

Main Backend currently creates the task/meeting after approval and records the
result locally. It does **not** currently POST the final execution result back
to AI Backend. This does not block draft/preview/approval E2E testing.

If AI Backend needs the outcome for agent memory or reporting, add this later:

```http
POST {AI_SERVICE_URL}/api/v1/ai/actions/execution-results
```

```json
{
  "requestId": "source-google_meet-66cc9bdfa847ea856c7b41d2",
  "proposalId": "66dd9bdfa847ea856c7b41d2",
  "actionId": "meeting-project-review",
  "status": "EXECUTED",
  "target": {
    "type": "PLATFORM_MEETING",
    "id": "66ee9bdfa847ea856c7b41d2"
  },
  "executedAt": "2026-09-10T10:30:00.000Z"
}
```

This endpoint is a follow-up integration item, not an excuse for the AI
Backend to execute Main Backend side effects.

## 7. End-to-end local test checklist

### Prerequisites

1. Main Backend, MongoDB and Redis are running.
2. Main Backend environment has:

   ```dotenv
   AI_SERVICE_URL=https://<ai-service-host>
   AI_SERVICE_SHARED_SECRET=<same-secret-configured-on-ai-service>
   AI_AUTOMATION_ENABLED=true
   REDIS_URL=redis://127.0.0.1:6379
   ```

3. `APP_BASE_URL` is the active HTTPS ngrok URL while testing Recall, Google,
   or Zoom callbacks. Its OAuth/webhook configuration must use that same URL.
4. Google Meet or Zoom connection and the provider meeting creation path are
   already working.
5. AI Backend implements both endpoints in sections 1 and 3, and returns the
   response shape exactly as shown.

### Test sequence

1. Create a new Google Meet or Zoom meeting through Main Backend and ensure the
   Recall bot joins.
2. Finish the meeting and wait for Recall `recording.done` then
   `transcript.done` webhook processing.
3. Confirm the transcript is available from Main Backend:

   ```http
   GET /api/v1/meeting-bots/:meetingBotId/transcript
   ```

4. Inspect Main Backend worker logs. A successful run calls
   `POST /api/v1/ai/jobs/analyze-source` once for that Meeting Bot ID.
5. Confirm proposal drafts were saved:

   ```http
   GET /api/v1/ai-actions/proposals?status=PENDING&page=1&limit=20
   GET /api/v1/ai-actions/proposals?status=NEEDS_CLARIFICATION&page=1&limit=20
   ```

6. For a complete task proposal, open its detail and call approve. Verify a
   Task exists using `GET /api/v1/tasks/:id` from `targetResourceId`.
7. For an incomplete meeting proposal, submit an answer:

   ```http
   POST /api/v1/ai-actions/proposals/:proposalId/clarifications
   Content-Type: application/json

   { "questionId": "meeting-start-time", "answer": "3:00 PM" }
   ```

8. Verify AI receives `POST /api/v1/ai/actions/refine`, then poll proposal
   detail until it becomes `PENDING`.
9. Approve it and verify the response has `targetResourceType` of
   `PLATFORM_MEETING`. Then verify the created meeting with:

   ```http
   GET /api/v1/meetings/:targetResourceId
   ```

10. Confirm the provider/calendar connection is valid. A proposal can be
    correctly analyzed but still become `FAILED` during approval if Zoom/Google
    credentials, calendar connection, or provider permissions are invalid.

### Repeat-test note

The transcript event enqueues analysis once per source ID. For a clean repeat,
create a new meeting/transcript. Reusing the same source/action ID with changed
AI content is intentionally rejected as an idempotency conflict.

## AI Backend completion checklist

- [ ] Verify `x-ai-actions-secret` on both required routes.
- [ ] Accept and use `context` in `analyze-source`.
- [ ] Return raw `{ requestId, source, actions, analysis }`, not the legacy
      `job_id/analysis/submitted_proposals` envelope.
- [ ] Echo request `jobId` as `requestId` and echo source type/ID unchanged.
- [ ] Never call Main Backend proposal, task, meeting, or approval APIs.
- [ ] Convert only supported task/meeting recommendations into `actions`.
- [ ] Ask clarification for unknown scheduling data instead of emitting a
      natural-language or guessed ISO date/time.
- [ ] Use `context.effectiveTimezone`; never use a hard-coded timezone.
- [ ] Implement `POST /api/v1/ai/actions/refine`.
- [ ] Preserve action identity/type across refinement.
- [ ] Test a full task proposal, a meeting clarification proposal, and a
      provider-meeting approval with the sequence above.
