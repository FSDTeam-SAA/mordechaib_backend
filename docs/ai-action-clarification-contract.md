# Main Backend <-> AI Backend integration contract

Status: code-reviewed contract for the current MVP  
Reviewed: 2026-09-15  
API prefix: `/api/v1`

This is the implementation contract for meeting, call, and user-message
analysis. When this document conflicts with an older AI integration example,
this document and the current Main Backend code are authoritative.

## 1. The flow and ownership boundary

```text
Meeting/call provider or frontend
  -> Main Backend stores the source
  -> Main Backend prepares bounded source context
  -> Main Backend calls AI Backend asynchronously
  -> AI Backend analyzes and returns JSON proposals
  -> Main Backend stores proposals
  -> OWNER/ADMIN supplies clarification when required
  -> Main Backend asks AI Backend to refine one proposal
  -> OWNER/ADMIN approves a complete proposal
  -> Main Backend creates the Task or Meeting
```

The AI Backend is a decision and proposal service. It must not directly create
a Main Backend task, meeting, calendar event, approval, or proposal. It must
not call frontend-authenticated write routes. The Main Backend owns database
writes, authorization, approval, provider credentials, and side effects.

This means that "AI schedules a meeting" has the following concrete meaning
in the current code: AI returns a `SCHEDULE_MEETING` proposal, an OWNER or
ADMIN approves it, and the Main Backend then creates the provider meeting.
Automatic execution without approval is not implemented.

## 2. Route ownership at a glance

### Main Backend calls AI Backend

| Method and AI Backend route | When | Required raw response |
| --- | --- | --- |
| `POST /api/v1/ai/jobs/analyze-source` | A meeting/call transcript or user message is ready | `{ requestId, source, actions, analysis }` |
| `POST /api/v1/ai/actions/refine` | A clarification answer was submitted | `{ action }` |
| `POST /api/v1/ai/agents/events` | An agent was created, changed, disabled, or activated | `{ eventId, accepted: true }` |

### AI Backend calls Main Backend

| Method and Main Backend route | When | Response shape |
| --- | --- | --- |
| `GET /api/v1/ai-internal/agents?limit=100&cursor=...` | Startup and periodic catalog reconciliation | Main Backend envelope: `{ success: true, data: { items, nextCursor } }` |

The catalog read is the only Main Backend route the AI Backend currently needs
to call. The AI Backend must not call `/tasks`, `/meetings`, `/calendar/events`,
or `/ai-actions/proposals`.

### Frontend calls Main Backend

The frontend sends messages, clarification answers, approvals, and rejections
only to the Main Backend. These routes use a user bearer token, not the shared
AI service secret.

## 3. Service-to-service wire rules

Every route in both service-to-service directions uses:

```http
x-ai-actions-secret: <same shared secret in both services>
Content-Type: application/json
```

- Main Backend environment name: `AI_SERVICE_SHARED_SECRET`.
- Main Backend AI base URL: `AI_SERVICE_URL`.
- Main Backend automation switch: `AI_AUTOMATION_ENABLED=true`.
- Never expose the shared secret to the browser.
- AI Backend responses to Main Backend must be raw JSON. Do not wrap them in
  `{ "success": true, "data": ... }`.
- Main Backend responses use its normal `{ success, data }` envelope.
- The current AI HTTP timeout defaults to 30 seconds.
- Queue jobs use six attempts with exponential backoff starting at five
  seconds.
- HTTP `408`, `429`, and `5xx` from AI Backend are retryable. Other non-2xx
  responses, an invalid success body, and invalid JSON are non-retryable.

## 4. Source triggers and canonical IDs

| Source type | Trigger in current code | Canonical `source.id` |
| --- | --- | --- |
| `GOOGLE_MEET` | Recall `transcript.done` is stored | Main Backend `meeting_bots._id` |
| `ZOOM_MEETING` | Recall `transcript.done` is stored | Main Backend meeting document `_id`; legacy Zoom can use `zoom_meetings._id` |
| `CALL_TRANSCRIPT` | Twilio recording is stored, transcribed, and queued | Main Backend `call_recordings._id` |
| `CALL_AUDIO` | Supported by the contract only when explicitly queued | Main Backend `call_recordings._id` |
| `USER_MESSAGE` | Frontend message is stored and queued | Main Backend `messages._id` |

Provider IDs such as Twilio `CallSid`, `RecordingSid`, Recall recording ID,
Zoom meeting number, or Google event ID must never replace the canonical
source ID. They may appear only inside `context` metadata.

For every source, Main Backend creates:

```text
requestId = "source-" + lowercase(source.type) + "-" + source.id
jobId = requestId
idempotencyKey = requestId
```

AI Backend must treat `source.id` as opaque and echo `jobId` as `requestId`
without modification.

Important current behavior:

- Recall sends signed meeting events to
  `POST /api/v1/webhooks/recall`. Main Backend queues the webhook, fetches and
  stores the finished transcript, and only then queues AI analysis.
- Twilio sends recording metadata as URL-encoded form data to
  `POST /api/v1/webhooks/twilio/recording`. Main Backend downloads the audio,
  stores the recording, transcribes it, and then queues transcript analysis.
  These are provider-authenticated ingestion routes, not AI Backend routes.
- Meeting analysis starts only after a completed transcript is stored.
- Twilio currently sends locally stored audio to the Main Backend transcription
  adapter first. The normal downstream source is `CALL_TRANSCRIPT`, not
  `CALL_AUDIO`.
- User-message analysis is delayed by 1.5 seconds by default. If a newer
  message exists when the job runs, the older job is marked completed and
  skipped.
- If one conversation has exactly one `NEEDS_CLARIFICATION` proposal, the
  next non-empty user text message is treated as the answer to that proposal's
  first unanswered question. If zero or multiple proposals need
  clarification, no automatic choice is made.

The direct-message entry route is:

```http
POST {MAIN_BACKEND_URL}/api/v1/messages
Authorization: Bearer <OWNER-ADMIN-or-MEMBER-token>
Content-Type: application/json
```

```json
{
  "conversationId": "66cc9bdfa847ea856c7b41c0",
  "clientMessageId": "550e8400-e29b-41d4-a716-446655440000",
  "content": "Create a task to send the quotation tomorrow"
}
```

`conversationId` is optional and must be a MongoDB ObjectId when present.
`clientMessageId` is an optional UUID used for safe frontend retries. A
message must contain non-empty text, one or more files, or both. File uploads
use `multipart/form-data` and the repeated field name `files`. The immediate
Main Backend response is a `{ success: true, data: <stored-message> }` envelope;
`data.processingStatus` starts as `PENDING`. Analysis is asynchronous.

## 5. Agent catalog synchronization

### 5.1 Bootstrap/reconciliation: AI Backend -> Main Backend

```http
GET {MAIN_BACKEND_URL}/api/v1/ai-internal/agents?limit=100&cursor=<opaque>
x-ai-actions-secret: <shared-secret>
```

Response:

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
        "updatedAt": "2026-09-15T08:00:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

Rules:

- `limit` is `1..100`; default is `100`.
- Treat `cursor` as opaque and follow pages until `nextCursor` is `null`.
- Persist the local catalog across restarts.
- Apply only a higher agent `version`.
- Retain disabled agents for history, but never assign new actions to them.
- Do not mark local records stale until a complete reconciliation succeeds.
- If bootstrap is incomplete or failed, return a retryable `503` from analysis
  rather than pretending that no actions were found.

Allowed agent types are:

```text
SALES, OPERATIONS, SUPPORT, MARKETING, STRATEGY,
CHIEF_OF_STAFF, DESIGN, CUSTOM
```

### 5.2 Incremental event: Main Backend -> AI Backend

```http
POST {AI_SERVICE_URL}/api/v1/ai/agents/events
x-ai-actions-secret: <shared-secret>
Content-Type: application/json
```

Request:

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
  "occurredAt": "2026-09-15T08:05:00.000Z"
}
```

Allowed event types are `AGENT_UPSERTED`, `AGENT_DISABLED`, and
`AGENT_ACTIVATED`.

Required raw response:

```json
{
  "eventId": "agent-66cc9bdfa847ea856c7b41a1-v4",
  "accepted": true
}
```

Processing must be idempotent by `eventId`. A duplicate or stale version is a
successful no-op and must still return `accepted: true` with the same
`eventId`.

## 6. Analyze source

### 6.1 Route: Main Backend -> AI Backend

```http
POST {AI_SERVICE_URL}/api/v1/ai/jobs/analyze-source
```

### 6.2 Request body

This is the request structure produced by the current worker. The sample is
based on the captured Google Meet request in `debug/` but omits the long raw
segment list.

```json
{
  "schemaVersion": "1.0",
  "jobId": "source-google_meet-6aa8cd0bfbd336c941c82f89",
  "idempotencyKey": "source-google_meet-6aa8cd0bfbd336c941c82f89",
  "organizationId": "6a7d637faaab59e0624cde06",
  "source": {
    "type": "GOOGLE_MEET",
    "id": "6aa8cd0bfbd336c941c82f89"
  },
  "context": {
    "organizationId": "6a7d637faaab59e0624cde06",
    "source": {
      "type": "GOOGLE_MEET",
      "id": "6aa8cd0bfbd336c941c82f89"
    },
    "occurredAt": "2026-09-15T04:47:47.087Z",
    "meeting": {
      "platform": "GOOGLE_MEET",
      "participants": ["Business"],
      "transcriptAvailable": true
    },
    "transcript": {
      "text": "...send the quotation... meeting September 16th with Hassan...",
      "segments": [],
      "wordCount": 101,
      "languageCode": "auto"
    },
    "organization": {
      "organizationId": "6a7d637faaab59e0624cde06",
      "name": "Example Business",
      "timezone": "UTC"
    },
    "requester": {
      "userId": "6a7d637faaab59e0624cde08",
      "name": "Example Owner"
    },
    "effectiveTimezone": "UTC"
  },
  "generatedAt": "2026-09-15T04:48:22.573Z"
}
```

`context` is already bounded and authorized by Main Backend. Use it directly.
Do not call a removed context route and do not request Recall, Twilio, Google,
or Zoom credentials.

Main Backend resolves `context.effectiveTimezone` as:

1. requester timezone, when available;
2. organization timezone.

An explicitly stated source timezone can override this for one action. Never
use a hard-coded timezone or the AI server timezone.

### 6.3 Source-specific context

Meeting context adds:

```json
{
  "meeting": {
    "platform": "ZOOM",
    "participants": ["Customer", "Owner"],
    "transcriptAvailable": true
  },
  "transcript": {
    "text": "Speaker: words...",
    "segments": [],
    "wordCount": 250,
    "languageCode": "auto"
  }
}
```

Call context adds:

```json
{
  "call": {
    "callSid": "CA...",
    "recordingSid": "RE...",
    "recordingDuration": 75,
    "recordingChannels": 1,
    "audioAvailable": true
  },
  "transcript": {
    "text": "Call transcript...",
    "segments": []
  }
}
```

User-message context adds the current message, up to 20 recent messages,
attachments, and active proposals from the same conversation:

```json
{
  "conversationId": "66cc9bdfa847ea856c7b41c0",
  "latestMessageId": "66cc9bdfa847ea856c7b41d4",
  "message": {
    "id": "66cc9bdfa847ea856c7b41d4",
    "senderType": "USER",
    "senderId": "66cc9bdfa847ea856c7b41d5",
    "type": "TEXT",
    "content": "Create a task to send the quotation tomorrow",
    "processingStatus": "PENDING",
    "createdAt": "2026-09-15T09:00:00.000Z"
  },
  "conversation": {
    "id": "66cc9bdfa847ea856c7b41c0",
    "title": "New Chat",
    "totalMessageCount": 3,
    "history": []
  },
  "attachments": [],
  "pendingProposals": []
}
```

Attachment entries may include a short-lived `downloadUrl`, plus extracted
text or transcription when available. Fetch the URL only while processing;
do not persist or expose it.

### 6.4 Required raw response

The following response correctly handles the captured intent: it creates one
ready task proposal and one meeting proposal that still needs a time and an
email address. Never turn an unknown time into midnight, and never put a
person's display name in `invitees`.

```json
{
  "requestId": "source-google_meet-6aa8cd0bfbd336c941c82f89",
  "source": {
    "type": "GOOGLE_MEET",
    "id": "6aa8cd0bfbd336c941c82f89"
  },
  "actions": [
    {
      "actionId": "task-send-quotation-001",
      "actionType": "CREATE_TASK",
      "proposedByAgent": {
        "id": "66cc9bdfa847ea856c7b41a1",
        "name": "Layla",
        "type": "OPERATIONS"
      },
      "payload": {
        "title": "Send the project quotation",
        "description": "Prepare and send the quotation discussed in the meeting.",
        "priority": "HIGH",
        "tags": ["quotation", "follow-up"]
      },
      "confidence": 0.92,
      "evidence": [
        {
          "text": "First of all, send the quotation."
        }
      ],
      "clarificationQuestions": []
    },
    {
      "actionId": "meeting-hassan-001",
      "actionType": "SCHEDULE_MEETING",
      "proposedByAgent": {
        "id": "66cc9bdfa847ea856c7b41a1",
        "name": "Layla",
        "type": "OPERATIONS"
      },
      "payload": {
        "platform": "GOOGLE_MEET",
        "title": "Project discussion with Hassan",
        "agenda": "Discuss the project timeline, pricing, scope, and quotation.",
        "timezone": "UTC",
        "durationMinutes": 60,
        "sendBot": true
      },
      "confidence": 0.86,
      "evidence": [
        {
          "text": "Meeting September 16th with Hassan."
        }
      ],
      "clarificationQuestions": [
        {
          "id": "meeting-start-time",
          "field": "startsAt",
          "question": "What time on September 16, 2026 should the meeting start?",
          "inputType": "datetime",
          "required": true
        },
        {
          "id": "hassan-email",
          "field": "invitees",
          "question": "What email address should be used to invite Hassan?",
          "inputType": "email",
          "required": true
        }
      ]
    }
  ],
  "analysis": {
    "summary": "The speaker requested a quotation and a follow-up project meeting with Hassan. The meeting date is known, but its time and Hassan's email are missing.",
    "overallConfidence": 0.89,
    "sentimentAnalysis": {
      "score": {
        "positive": 35,
        "neutral": 60,
        "negative": 5
      }
    },
    "customerIntelligence": {
      "healthScore": 78,
      "riskLevel": "LOW"
    },
    "patternDetection": {
      "followUpRequests": 90
    },
    "classifiedSegments": [
      {
        "id": "action-item-quotation-001",
        "category": "ACTION_ITEM",
        "text": "First of all, send the quotation.",
        "speaker": "Business",
        "confidence": 0.94
      }
    ]
  }
}
```

### 6.5 Top-level response rules

| Field | Rule |
| --- | --- |
| `requestId` | Required, maximum 200 chars; exactly equals request `jobId` |
| `source.type` | Exactly equals request `source.type` |
| `source.id` | Exactly equals request `source.id` |
| `actions` | Required array; may be empty when no supported action exists |
| `analysis` | Required even when `actions` is empty |

The response must not contain `job_id`, `submitted_proposals`,
`backend_result`, or a Main Backend callback result.

### 6.6 Analysis rules

| Field | Rule |
| --- | --- |
| `summary` | Optional trimmed string, maximum 10,000 chars |
| `overallConfidence` | Optional finite number `0..1`; if absent and actions exist, Main Backend uses their mean confidence |
| `sentimentAnalysis.score.positive` | Required finite number `0..100` |
| `sentimentAnalysis.score.neutral` | Required finite number `0..100` |
| `sentimentAnalysis.score.negative` | Required finite number `0..100` |
| Sentiment sum | Must equal `100`, tolerance `0.01` |
| `customerIntelligence.healthScore` | Required finite number `0..100` |
| `customerIntelligence.riskLevel` | Required non-empty string; Main Backend uppercases it |
| `patternDetection` | Required object; supported optional scores are `valueProposition`, `pricingObjection`, `budgetApproval`, `marketTrends`, `followUpRequests`, each `0..100` |
| `classifiedSegments` | Optional, maximum 500 items with unique IDs |
| Segment category | `OBJECTION`, `COMMITMENT`, or `ACTION_ITEM` |
| Segment `id` / `text` | Required; maximum 128 / 5,000 chars |
| Segment time | Optional non-negative seconds; end cannot precede start |
| Segment confidence | Optional finite number `0..1` |

Omitted pattern score means "not evaluated or insufficient evidence". Zero
means "evaluated and not detected".

### 6.7 Action rules

| Field | Rule |
| --- | --- |
| `actionId` | Required trimmed string, maximum 128 chars, unique in this response, stable on every retry |
| `actionType` | Exactly `CREATE_TASK` or `SCHEDULE_MEETING` |
| `proposedByAgent.id` | Active Main Backend agent MongoDB ObjectId from synchronized catalog |
| `proposedByAgent.name` | Required catalog display name, maximum 200 chars |
| `proposedByAgent.type` | One of the allowed catalog types |
| `payload` | One complete action object; rules are in section 7 |
| `confidence` | Required finite number `0..1` |
| `evidence` | Optional array; every item requires `text` (maximum 5,000 chars) |
| `clarificationQuestions` | Optional, maximum 10 items with unique IDs |

Each clarification question has:

```json
{
  "id": "meeting-start-time",
  "field": "startsAt",
  "question": "What time should the meeting start?",
  "inputType": "datetime",
  "required": true
}
```

`id`, `field`, and `question` are required and have maximum lengths 128, 200,
and 2,000. `inputType` is optional and must not exceed 32 characters.
`required` defaults to `true` unless explicitly `false`.

When questions are present, Main Backend stores the proposal as
`NEEDS_CLARIFICATION`. Otherwise it validates the complete payload and stores
the proposal as `PENDING`.

The AI Backend chooses `proposedByAgent` per action. New proposals must use an
active catalog ID. Main Backend verifies the ID, then stores the canonical
current name and type. Never invent IDs such as `operations-agent` or use an
agent display name as the ID.

## 7. Action payloads

### 7.1 `CREATE_TASK`

Allowed keys only:

```text
title, description, assignedToUserId, department, priority, dueDate,
estimatedDurationMinutes, stakeholderIds, dependencies,
requiredAttachments, reminder, subtasks, tags
```

| Field | Required/rules |
| --- | --- |
| `title` | Required string, `1..200` chars |
| `description` | Optional string, max 10,000 |
| `assignedToUserId` | Optional string, max 100; if supplied, must be a MongoDB user ID in this organization |
| `department` | Optional: `SALES`, `FINANCE`, `OPERATIONS`, `SUPPORT`, `DESIGN`, `MARKETING`, `OTHER` |
| `priority` | Optional: `LOW`, `MEDIUM`, `HIGH` |
| `dueDate` | Optional strict ISO-8601 datetime |
| `estimatedDurationMinutes` | Optional integer `0..525600` |
| `stakeholderIds` | Optional unique string array, max 100 items |
| `dependencies` | Optional max 100; `{ title: string(1..200), isComplete?: boolean }` |
| `requiredAttachments` | Optional max 100; `{ name: string(1..200), isComplete?: boolean }` |
| `reminder` | Optional; `{ enabled?: boolean, minutesBeforeDue?: integer(0..40320) }` |
| `subtasks` | Optional max 100; `{ title: string(1..200), isComplete?: boolean, dueDate?: ISO-8601 }` |
| `tags` | Optional unique string array, max 50 items, max 50 chars each |

Do not send `status`, uploaded `attachments`, or `aiAssistance`; those fields
exist in the general task DTO but are deliberately excluded from AI proposal
payloads. Do not guess an assignee ID. Ask a clarification when assignment is
required but unknown.

### 7.2 `SCHEDULE_MEETING`

Allowed keys only:

```text
platform, title, agenda, startsAt, durationMinutes, timezone, invitees,
reminderMinutesBeforeStart, sendBot, botName
```

| Field | Required/rules |
| --- | --- |
| `platform` | Required: `ZOOM` or `GOOGLE_MEET` |
| `title` | Required string, `1..200` chars |
| `agenda` | Optional string, max 2,000 |
| `startsAt` | Required when no clarification remains; strict absolute ISO-8601 ending in `Z` or an explicit `+/-HH:MM` offset |
| `durationMinutes` | Optional integer `1..1440` |
| `timezone` | Required when no clarification remains; valid IANA timezone, max 100 chars |
| `invitees` | Optional unique valid-email array, max 100; values are trimmed and lowercased |
| `reminderMinutesBeforeStart` | Optional integer `0..40320` |
| `sendBot` | Optional boolean; defaults to `true` |
| `botName` | Optional string, max 100 |

Do not send `idempotencyKey` or `metadata`; those general meeting-create fields
are excluded from AI proposals.

Main Backend inserts `context.effectiveTimezone` when an AI meeting payload
omits timezone. AI Backend should still return timezone explicitly. Main
Backend normalizes `startsAt` to UTC before persistence. The meeting must still
be in the future when it is approved and executed; an elapsed `startsAt`
causes execution to fail.

Examples:

```text
Valid:   2026-09-16T09:00:00.000Z
Valid:   2026-09-16T15:00:00+06:00
Invalid: 2026-09-16T15:00:00
Invalid: September 16 at 3 PM
Invalid: 2026-09-16T00:00:00Z when the time was never stated
```

If the source says `September 16 at 3 PM` and the effective timezone is
`Asia/Dhaka`, `2026-09-16T09:00:00.000Z` and
`2026-09-16T15:00:00+06:00` represent the same valid instant. If only the date
is known, ask for the time. If an invitee is named but their email is required
and unavailable, ask for their email rather than placing the name in
`invitees`.

When clarification exists, preserve known valid payload fields and omit the
unknown field. Although Main Backend temporarily permits an incomplete payload
while questions remain, do not use this to send unsupported or incorrectly
typed fields. The final refined payload is strictly whitelisted.

## 8. Clarification and refinement

### 8.1 Explicit frontend answer: Frontend -> Main Backend

```http
POST {MAIN_BACKEND_URL}/api/v1/ai-actions/proposals/:proposalMongoId/clarifications
Authorization: Bearer <OWNER-or-ADMIN-token>
Content-Type: application/json
```

Body:

```json
{
  "questionId": "meeting-start-time",
  "answer": "2026-09-16 at 3:00 PM Asia/Dhaka"
}
```

Both strings are trimmed and required. `questionId` is limited to 128 chars;
`answer` is limited to 2,000 chars. The proposal must currently be
`NEEDS_CLARIFICATION`, and the question ID must exist.

Main Backend returns its normal envelope. `data.status` is `ANALYZING` because
the AI refinement job is asynchronous:

```json
{
  "success": true,
  "data": {
    "id": "66dd9bdfa847ea856c7b41d2",
    "status": "ANALYZING",
    "clarificationAnswers": {
      "meeting-start-time": "2026-09-16 at 3:00 PM Asia/Dhaka"
    }
  }
}
```

### 8.2 Refine route: Main Backend -> AI Backend

```http
POST {AI_SERVICE_URL}/api/v1/ai/actions/refine
x-ai-actions-secret: <shared-secret>
Content-Type: application/json
```

Request:

```json
{
  "requestId": "source-google_meet-6aa8cd0bfbd336c941c82f89",
  "proposal": {
    "id": "66dd9bdfa847ea856c7b41d2",
    "schemaVersion": "1.0",
    "proposalId": "source-google_meet-6aa8cd0bfbd336c941c82f89:meeting-hassan-001",
    "requestId": "source-google_meet-6aa8cd0bfbd336c941c82f89",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "66cc9bdfa847ea856c7b41a1",
      "name": "Layla",
      "type": "OPERATIONS"
    },
    "source": {
      "type": "GOOGLE_MEET",
      "id": "6aa8cd0bfbd336c941c82f89"
    },
    "payload": {
      "platform": "GOOGLE_MEET",
      "title": "Project discussion with Hassan",
      "timezone": "UTC",
      "durationMinutes": 60,
      "sendBot": true
    },
    "clarificationQuestions": [
      {
        "id": "meeting-start-time",
        "field": "startsAt",
        "question": "What time should the meeting start?",
        "inputType": "datetime",
        "required": true
      },
      {
        "id": "hassan-email",
        "field": "invitees",
        "question": "What email address should be used to invite Hassan?",
        "inputType": "email",
        "required": true
      }
    ],
    "clarificationAnswers": {
      "meeting-start-time": "2026-09-16 at 3:00 PM Asia/Dhaka"
    },
    "revision": 1,
    "status": "ANALYZING"
  },
  "clarification": {
    "questionId": "meeting-start-time",
    "answer": "2026-09-16 at 3:00 PM Asia/Dhaka"
  }
}
```

The `proposal` is the complete current Main Backend proposal object. It does
not contain a separate `actionId`. Recover it by removing the exact prefix
`requestId + ":"` from `proposal.proposalId`:

```text
proposalId = requestId + ":" + actionId
```

Do not guess a sequence number and do not split on an arbitrary last colon.

### 8.3 Required raw refine response

After answering only the time, the AI must preserve the unanswered email
question:

```json
{
  "action": {
    "actionId": "meeting-hassan-001",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "66cc9bdfa847ea856c7b41a1",
      "name": "Layla",
      "type": "OPERATIONS"
    },
    "payload": {
      "platform": "GOOGLE_MEET",
      "title": "Project discussion with Hassan",
      "agenda": "Discuss the project timeline, pricing, scope, and quotation.",
      "startsAt": "2026-09-16T09:00:00.000Z",
      "timezone": "Asia/Dhaka",
      "durationMinutes": 60,
      "sendBot": true
    },
    "confidence": 0.9,
    "evidence": [],
    "clarificationQuestions": [
      {
        "id": "hassan-email",
        "field": "invitees",
        "question": "What email address should be used to invite Hassan?",
        "inputType": "email",
        "required": true
      }
    ]
  }
}
```

After all required answers are known, return the full final action with
`clarificationQuestions: []` or omit that property:

```json
{
  "action": {
    "actionId": "meeting-hassan-001",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "66cc9bdfa847ea856c7b41a1",
      "name": "Layla",
      "type": "OPERATIONS"
    },
    "payload": {
      "platform": "GOOGLE_MEET",
      "title": "Project discussion with Hassan",
      "agenda": "Discuss the project timeline, pricing, scope, and quotation.",
      "startsAt": "2026-09-16T09:00:00.000Z",
      "timezone": "Asia/Dhaka",
      "durationMinutes": 60,
      "invitees": ["hassan@example.com"],
      "sendBot": true
    },
    "confidence": 0.94,
    "evidence": [],
    "clarificationQuestions": []
  }
}
```

Refinement invariants:

- Return exactly one top-level `action` object.
- Preserve the original `actionId` exactly.
- Preserve `actionType` exactly.
- Preserve the complete original `proposedByAgent` snapshot; do not reassign
  even if the catalog changed or the agent was disabled after proposal
  creation.
- Return the complete revised payload, not a JSON merge patch.
- Return all still-unanswered questions.
- Never overwrite known fields with guessed values.
- A valid remaining question returns the proposal to
  `NEEDS_CLARIFICATION`; no questions moves it to `PENDING`.
- Every successful refinement increments `revision`.

If all refinement attempts fail, Main Backend restores the proposal from
`ANALYZING` to `NEEDS_CLARIFICATION` so the answer can be retried.

## 9. Proposal approval and execution

The AI Backend does not participate in these calls. They are included so the
complete lifecycle is unambiguous.

```text
Complete analysis:       PENDING -> APPROVED -> EXECUTING -> EXECUTED
Incomplete analysis:     NEEDS_CLARIFICATION -> ANALYZING
                                              -> NEEDS_CLARIFICATION
                                              -> PENDING
Rejected ready proposal: PENDING -> REJECTED
Execution failure:       EXECUTING -> FAILED -> EXECUTING (manual retry)
```

Frontend routes, all OWNER/ADMIN authenticated:

| Route | Body/use |
| --- | --- |
| `GET /api/v1/ai-actions/proposals?status=NEEDS_CLARIFICATION&page=1&limit=20` | List proposals needing answers |
| `GET /api/v1/ai-actions/proposals?status=PENDING&page=1&limit=20` | List ready proposals |
| `GET /api/v1/ai-actions/proposals/:id` | Proposal detail |
| `POST /api/v1/ai-actions/proposals/:id/clarifications` | `{ "questionId": "...", "answer": "..." }` |
| `POST /api/v1/ai-actions/proposals/:id/action` | `{ "action": "APPROVE" }`, `{ "action": "REJECT", "reason": "..." }`, or `{ "action": "RETRY" }` |
| `GET /api/v1/ai-actions/sources/:sourceId/action-center?sourceType=GOOGLE_MEET&status=NEEDS_CLARIFICATION` | Compact task/meeting cards with clarification questions and submitted answers |

Approval success returns the Main Backend envelope containing both the final
proposal and target:

```json
{
  "success": true,
  "data": {
    "proposal": {
      "id": "66dd9bdfa847ea856c7b41d2",
      "status": "EXECUTED",
      "targetResourceType": "PLATFORM_MEETING",
      "targetResourceId": "66ee9bdfa847ea856c7b41d2"
    },
    "target": {
      "type": "PLATFORM_MEETING",
      "id": "66ee9bdfa847ea856c7b41d2"
    }
  }
}
```

Task targets use type `TASK`. No execution-result callback to AI Backend is
implemented in the current code.

## 10. Idempotency and conflict behavior

- The Main Backend queue job ID is a SHA-256 hash of the source identity.
- AI Backend should cache or deterministically reproduce the response for the
  same `idempotencyKey`.
- Each stored proposal identity is:

  ```text
  proposalId = requestId + ":" + actionId
  ```

- Repeating the same proposal with identical normalized content is accepted as
  a duplicate.
- Reusing the same proposal identity with different content causes a conflict.
- Therefore retries must not randomly change action IDs, agent assignments,
  payload values, analysis scores, question IDs, or evidence.
- There is no bulk approval endpoint; every action is an independent proposal.

## 11. Error expectations

AI Backend should use:

| Status | Meaning to Main Backend |
| --- | --- |
| `200` | Valid raw JSON response |
| `400` / `422` | Permanent request/contract problem; queue does not keep retrying |
| `401` / `403` | Shared-secret problem; permanent until configuration is fixed |
| `408` | Temporary timeout; retryable |
| `429` | Temporary capacity/rate limit; retryable |
| `500` / `502` / `503` / `504` | Temporary server/dependency failure; retryable |

Main Backend frontend/API errors use:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Human-readable message or validation message array",
  "path": "/api/v1/...",
  "timestamp": "2026-09-15T10:00:00.000Z"
}
```

## 12. Known mismatch checklist for the AI Backend

These are the legacy/common shapes that do not match the reviewed Main
Backend contract. The AI Backend implementation and its tests must remove or
adapt them.

| Mismatch | Required fix |
| --- | --- |
| Response uses `job_id` | Return camel-case `requestId` equal to request `jobId` |
| Response uses `analysis.tasks` or `submitted_proposals` | Return top-level `actions`; never post proposals back |
| AI calls a Main Backend proposal/task/meeting write route | Remove the callback; return proposal JSON only |
| AI ignores inline `context` or tries to fetch old source-context routes | Analyze the supplied `context` |
| Missing `POST /api/v1/ai/actions/refine` | Implement it with the exact request/response above |
| AI returns tool names such as `tasks.create_task` or `calendar.create_event` | Map to `CREATE_TASK` or `SCHEDULE_MEETING` |
| AI returns email/CRM actions | Keep narrative-only for this MVP; do not add them to `actions` |
| Agent ID is `operations-agent`, an agent name, or AI-generated | Use the synchronized active MongoDB ObjectId |
| Refinement assigns a new agent | Preserve the stored agent snapshot |
| Refinement guesses `actionId` or always returns `001` | Recover and preserve it from `proposalId` |
| Meeting uses natural-language `startsAt` | Resolve to an absolute ISO instant or ask clarification |
| Meeting guesses midnight when only a date is known | Omit `startsAt` and ask for time |
| Meeting hard-codes `Asia/Dhaka`, UTC, or server timezone | Use explicit source timezone, then `effectiveTimezone` |
| `invitees` contains `Hassan` or another display name | Use valid email addresses only, or ask clarification |
| AI response has `{ success, data }` wrapper | Return raw JSON from AI routes |
| Agent catalog bootstrap reads top-level `items` | Read Main Backend `data.items` and `data.nextCursor` |
| Ready payload contains unsupported DTO fields | Apply the exact whitelist in section 7 |
| Empty actions are returned while catalog bootstrap failed | Return retryable `503`; empty actions are for a genuine no-action result |

## 13. Acceptance tests

The AI Backend is compatible only when all of these pass:

1. Catalog bootstrap reads every page from `data.items`, persists agents, and
   routes only to active agents.
2. Agent events are idempotent by event/version and acknowledge the exact
   `eventId`.
3. Analyze request echoes `jobId` and `source` exactly.
4. A no-action source still returns a valid required `analysis` object.
5. One source can return multiple distinct task/meeting actions.
6. Repeating the same analyze request returns stable action IDs and content.
7. A complete `CREATE_TASK` payload becomes `PENDING`.
8. A meeting with a missing time becomes `NEEDS_CLARIFICATION` without a
   guessed `startsAt`.
9. A named invitee without an email produces a question rather than an invalid
   `invitees` value.
10. Refinement preserves `actionId`, `actionType`, and agent snapshot.
11. Partial refinement retains every unanswered question.
12. Final refinement returns the whole valid payload and becomes `PENDING`.
13. `3:00 PM Asia/Dhaka` resolves to `09:00Z` on the same date.
14. Approval creates exactly one Task or Meeting in Main Backend.
15. An AI `503` is retried, while an invalid successful JSON body fails as a
    permanent contract error.

## 14. Main Backend implementation references

The contract above was derived from these current files:

- `src/modules/ai-integration/ai-jobs.processor.ts`: outbound analyze,
  refinement, and agent-event calls.
- `src/modules/ai-integration/ai-jobs.queue.ts`: sources, idempotency, retry,
  and backoff.
- `src/modules/ai-integration/ai-service.client.ts`: secret header, timeout,
  raw JSON, and retryable HTTP statuses.
- `src/modules/ai-internal/ai-source-context.service.ts`: meeting, call, and
  message context.
- `src/modules/ai-actions/ai-actions.service.ts`: identity, analysis, action,
  payload, agent, clarification, and execution validation.
- `src/modules/ai-actions/dto/create-ai-action-proposal.dto.ts`: exact AI
  payload field whitelist.
- `src/modules/ai-actions/dto/ai-analysis-result.dto.ts`: AI response types.
- `src/modules/agents/ai-agent-catalog.controller.ts`: service-authenticated
  catalog route.
- `src/modules/messages/messages.service.ts`: direct-message trigger.
- `src/modules/meeting-bots/meeting-bots.service.ts`: Recall transcript trigger.
- `src/modules/twilio/twilio.service.ts` and
  `src/modules/ai-integration/call-transcription.service.ts`: Twilio audio and
  transcription trigger.
- `debug/analyze-source-request-6aa8cd0bfbd336c941c82f89.json`: captured
  Google Meet analyze request.

For the broader historical handoff, see
`docs/AI_BACKEND_MVP_API_CONTRACT.md`. When copying examples, prefer this
reviewed contract because some older documents still contain legacy semantic
agent IDs or obsolete output fields.
