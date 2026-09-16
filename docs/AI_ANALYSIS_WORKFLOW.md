# AI Analysis Workflow

## Ownership

```text
Frontend → Main Backend → AI Backend → Main Backend → Frontend
```

The AI Backend is an analysis service only. It never calls a Main Backend
write API and never creates a task, meeting, calendar event, or CRM record.
The Main Backend owns all persistence, CEO interaction, approval, and
execution.

## AI service contract

Base URL: `{AI_SERVICE_URL}`

Every request below is sent by the Main Backend with:

```http
x-ai-actions-secret: <AI_SERVICE_SHARED_SECRET>
Content-Type: application/json
```

### `POST /api/v1/ai/jobs/analyze-source`

The Main Backend sends a bounded source context after a call or meeting
transcript completes.

```json
{
  "schemaVersion": "1.0",
  "jobId": "source-google_meet-meeting-bot-id",
  "idempotencyKey": "source-google_meet-meeting-bot-id",
  "organizationId": "MongoDB ObjectId",
  "source": { "type": "GOOGLE_MEET", "id": "meeting-bot-id" },
  "context": {
    "organizationId": "MongoDB ObjectId",
    "organization": {
      "organizationId": "MongoDB ObjectId",
      "name": "Example Ltd.",
      "timezone": "Asia/Dhaka",
      "language": "en",
      "industry": "Software",
      "businessSize": "SMALL",
      "businessHours": {}
    },
    "requester": {
      "userId": "organizer-user-id",
      "name": "Rifat Hossain",
      "timezone": "America/New_York",
      "language": "en"
    },
    "effectiveTimezone": "America/New_York",
    "transcript": { "text": "...", "segments": [] }
  },
  "generatedAt": "2026-09-10T10:00:00.000Z"
}
```

The AI service returns JSON only. It must not call any Main Backend endpoint.
The Main Backend does not select an agent. The AI Backend master agent routes
the source to specialist agents from the global active catalog, and every
returned action identifies its owner through required `proposedByAgent.id`,
`name`, and `type` fields.

### Chat message analysis

CEO text and attachment messages use the same proposal pipeline. `POST
/messages` stores the message first and schedules a delayed `USER_MESSAGE`
analysis job. The delay (default 1.5 seconds, configurable with
`AI_MESSAGE_ANALYSIS_DELAY_MS`) is an inactivity debounce: if another message
arrives before the job runs, the older job is marked superseded and only the
latest bounded conversation context is analyzed. The system never relies on a
fixed number of messages.

The message source id is the user message MongoDB id, not the conversation id:

```json
{
  "source": { "type": "USER_MESSAGE", "id": "message-mongodb-id" },
  "context": {
    "conversationId": "conversation-mongodb-id",
    "message": { "content": "Schedule the client meeting next Monday" },
    "conversation": { "history": [] },
    "attachments": [],
    "pendingProposals": []
  }
}
```

Generated proposals persist `conversationId`, so later clarification answers
can be associated with the correct conversation. When exactly one proposal is
waiting for clarification, a subsequent text message is treated as its answer
and sent through `/api/v1/ai/actions/refine`; ambiguous conversations must use
the explicit clarification endpoint. Final Task/Meeting approval remains an
explicit CEO operation and is never inferred from a chat message.

For the meeting/call MVP, the response must also include an analysis summary
with sentiment, customer intelligence, and pattern detection. Main Backend
stores this source-level snapshot with every generated proposal so the
frontend can display it and later reporting can query it.

```json
{
  "requestId": "source-google_meet-meeting-bot-id",
  "source": { "type": "GOOGLE_MEET", "id": "meeting-bot-id" },
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
        "priority": "HIGH"
      },
      "confidence": 0.92,
      "evidence": [{ "text": "I am going to send the quotation later." }]
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
        "timezone": "America/New_York"
      },
      "clarificationQuestions": [
        {
          "id": "meeting-time",
          "field": "startsAt",
          "question": "What time should the 15 September meeting start?",
          "inputType": "TIME",
          "required": true
        }
      ],
      "confidence": 0.86,
      "evidence": [{ "text": "We will join the next meeting on 15 September." }]
    }
  ],
  "analysis": {
    "summary": "The customer requested a quotation and follow-up meeting.",
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
        "confidence": 0.94
      }
    ]
  }
}
```

Rules:

- Supported `actionType` values: `CREATE_TASK`, `SCHEDULE_MEETING`.
- Use the Main Backend Agent MongoDB ObjectId received from catalog sync.
- Every `proposedByAgent` must include `id`, display `name`, and a valid `type`:
  `SALES`, `OPERATIONS`, `SUPPORT`, `MARKETING`, `STRATEGY`,
  `CHIEF_OF_STAFF`, `DESIGN`, or `CUSTOM`.
- Pattern signals are individually optional. Omit a signal when it could not
  be evaluated; send `0` only when it was evaluated and not detected.
- Return a source `summary`, `overallConfidence`, and zero or more classified
  transcript segments. Segment categories are `OBJECTION`, `COMMITMENT`, and
  `ACTION_ITEM`; the frontend builds the All tab from the raw transcript.
- Main Backend resolves `context.effectiveTimezone` from requester timezone,
  then organization timezone. AI must not hard-code `Asia/Dhaka` or use its
  server timezone.
- A ready meeting needs `platform`, `title`, an absolute ISO-8601 `startsAt`
  containing `Z` or an explicit UTC offset, and a valid IANA timezone. Main
  Backend normalizes `startsAt` to UTC before persistence. If a required value
  is unknown, return a clarification question.
- Response `requestId` and `source` must exactly echo the request. `actionId`
  is non-empty, maximum 128 characters, unique and stable within one
  `requestId`; retries with unchanged content are idempotent.
- A refinement response must preserve both its original `actionId` and
  `actionType`.
- Email, CRM, and calendar tool recommendations are not supported action
  types in this MVP. Return them as narrative only, not actions.

### `POST /api/v1/ai/actions/refine`

Called only after a CEO answers a clarification question.

```json
{
  "requestId": "source-google_meet-meeting-bot-id",
  "proposal": { "id": "main-backend-proposal-id" },
  "clarification": {
    "questionId": "meeting-time",
    "answer": "3:00 PM"
  }
}
```

Return one updated action:

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
      "startsAt": "2026-09-15T19:00:00.000Z",
      "durationMinutes": 30,
      "timezone": "America/New_York",
      "invitees": []
    },
    "confidence": 0.9,
    "evidence": []
  }
}
```

## Frontend API

All routes use a CEO/Owner/Admin bearer token. The frontend never calls the
AI service directly.

| Method | Route                                                | Purpose                                                                      |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/api/v1/ai-actions/proposals`                       | List drafts and ready proposals. Filter by `status`, `actionType`, or agent. |
| `GET`  | `/api/v1/ai-actions/proposals/:id`                   | Read one proposal and its clarification questions.                           |
| `POST` | `/api/v1/ai-actions/proposals/:id/clarifications`    | Submit `{ "questionId": "...", "answer": "..." }`.                           |
| `POST` | `/api/v1/ai-actions/proposals/:id/action`            | Submit `APPROVE`, `REJECT`, or `RETRY`; rejection also requires `reason`.     |
| `GET`  | `/api/v1/ai-actions/sources/:sourceId/action-center` | Return source proposal cards, clarification questions, and submitted answers. |

Proposal statuses:

```text
ANALYZING → NEEDS_CLARIFICATION → PENDING → APPROVED
→ EXECUTING → EXECUTED
```

`PENDING` means the draft is complete and ready for one final CEO approval.
`NEEDS_CLARIFICATION` is not executable.

## Execution boundary

Only `POST /ai-actions/proposals/:id/action` with `{ "action": "APPROVE" }`
can execute a task or provider meeting. The approving CEO/Admin becomes the
created-by user. No AI request can bypass this boundary.
