# AI Backend Chat Implementation Contract

## 1. Objective

Implement one dedicated AI Chat endpoint that receives an organizer's current
message with conversation context and returns:

1. a natural-language reply; and
2. exactly one structured result.

Supported result types:

```text
MESSAGE
CLARIFICATION
TASK_PROPOSAL
MEETING_PROPOSAL
```

This endpoint is only for interactive chat. Do not reuse the call, transcript,
or meeting analysis endpoint:

```http
POST /api/v1/ai/jobs/analyze-source
```

The AI Backend does not create Main Backend tasks or meetings. It prepares a
proposal; Main Backend and the organizer handle validation, editing, approval,
and execution.

## 2. Endpoint to implement

Recommended route:

```http
POST /api/v1/ai/chat
Content-Type: application/json
x-ai-actions-secret: <shared-service-secret>
```

If the AI Backend already uses another chat path, retain that path and
implement the same contract. Main Backend will configure the final path.

Requirements:

- validate `x-ai-actions-secret`;
- accept and return JSON;
- return raw response JSON without `{ success, data }` wrapping;
- return within the Main Backend HTTP timeout;
- never log the shared secret or complete private message history;
- never call the source-analysis endpoint internally;
- never write directly to Main Backend storage.

## 3. Request contract

```ts
type AgentIdentity = {
  id: string;
  name: string;
  type: string;
  imageUrl?: string;
};

type ChatMessage = {
  id: string;
  senderType: "USER" | "AI" | "SYSTEM";
  content: string;
  createdAt: string; // ISO-8601 instant
  sourceMessageId?: string;
  agent?: AgentIdentity;
};

type PendingChatDraft = {
  id: string;
  kind: "TASK" | "MEETING";
  status: "NEEDS_CLARIFICATION" | "READY";
  revision: number;
  payload: Record<string, unknown>;
  questions?: ClarificationQuestion[];
};

type AiChatTurnRequest = {
  schemaVersion: "1.0";
  turnId: string;
  idempotencyKey: string;
  organizationId: string;
  conversation: {
    id: string;
    title: string;
    selectedAgent: AgentIdentity;
  };
  message: {
    id: string;
    senderType: "USER";
    content: string;
    createdAt: string;
  };
  recentMessages: ChatMessage[];
  historyPage: {
    included: number;
    hasOlder: boolean;
    olderMessagesCursor: string | null;
    olderMessagesPath?: string;
  };
  pendingDrafts: PendingChatDraft[];
  context: {
    effectiveTimezone: string; // IANA timezone
    language: string;
    currentTime: string; // ISO-8601 instant
  };
};
```

### Example request

```json
{
  "schemaVersion": "1.0",
  "turnId": "chat-turn-6acc73f1c89621797405eb83",
  "idempotencyKey": "chat-turn-6acc73f1c89621797405eb83",
  "organizationId": "6ab750484438958c8b717d1e",
  "conversation": {
    "id": "6acc7392c89621797405eb70",
    "title": "New Chat",
    "selectedAgent": {
      "id": "6aa51d409e98784ad526525a",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    }
  },
  "message": {
    "id": "6acc73f1c89621797405eb83",
    "senderType": "USER",
    "content": "Schedule a meeting with Amit tomorrow afternoon",
    "createdAt": "2026-10-17T06:10:00.000Z"
  },
  "recentMessages": [
    {
      "id": "6acc73d9c89621797405eb70",
      "senderType": "USER",
      "content": "I need to speak with Amit",
      "createdAt": "2026-10-17T06:08:00.000Z"
    },
    {
      "id": "6acc73e5c89621797405eb77",
      "senderType": "AI",
      "sourceMessageId": "6acc73d9c89621797405eb70",
      "agent": {
        "id": "6aa51d409e98784ad526525a",
        "name": "Laura",
        "type": "CHIEF_OF_STAFF"
      },
      "content": "I can help schedule that meeting.",
      "createdAt": "2026-10-17T06:08:02.000Z"
    },
    {
      "id": "6acc73f1c89621797405eb83",
      "senderType": "USER",
      "content": "Schedule a meeting with Amit tomorrow afternoon",
      "createdAt": "2026-10-17T06:10:00.000Z"
    }
  ],
  "historyPage": {
    "included": 20,
    "hasOlder": false,
    "olderMessagesCursor": null
  },
  "pendingDrafts": [],
  "context": {
    "effectiveTimezone": "Asia/Dhaka",
    "language": "en",
    "currentTime": "2026-10-17T06:10:00.100Z"
  }
}
```

### Request interpretation rules

- `turnId` identifies the current chat turn.
- `conversation.id` identifies the complete chat session.
- `message` is the current organizer message.
- `recentMessages` is chronological, oldest to newest.
- The current message appears exactly once in `recentMessages`.
- USER and AI messages are both included.
- `pendingDrafts` contains unfinished task/meeting work from earlier turns.
- `selectedAgent` is authoritative; respond as that agent.
- Resolve phrases such as “tomorrow at 3 PM” using `currentTime` and
  `effectiveTimezone`.
- Do not require analyzer-specific sentiment, transcript, or customer-health
  data.

## 4. Unified response contract

```ts
type AiChatTurnResponse = {
  schemaVersion: "1.0";
  turnId: string;
  conversationId: string;
  inReplyToMessageId: string;
  reply: {
    id: string;
    content: string;
    agent: AgentIdentity;
  };
  result:
    | MessageResult
    | ClarificationResult
    | TaskProposalResult
    | MeetingProposalResult;
};

type MessageResult = {
  type: "MESSAGE";
};
```

Response requirements:

- echo `turnId`, `conversationId`, and current message ID exactly;
- always return a non-empty `reply.content`;
- return the request's selected agent exactly;
- return exactly one `result.type`;
- keep reply and draft IDs stable during idempotent replay;
- do not include analyzer-style `analysis` or `actions` fields;
- do not claim that a task or meeting was executed.

## 5. Result: `MESSAGE`

Use this for greetings, questions, advice, summaries of supplied conversation
context, or any response that does not create/continue a structured draft.

```json
{
  "schemaVersion": "1.0",
  "turnId": "chat-turn-6acc73f1c89621797405eb83",
  "conversationId": "6acc7392c89621797405eb70",
  "inReplyToMessageId": "6acc73f1c89621797405eb83",
  "reply": {
    "id": "chat-reply-6acc73f1c89621797405eb83-v1",
    "content": "Good morning. How can I help you today?",
    "agent": {
      "id": "6aa51d409e98784ad526525a",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    }
  },
  "result": {
    "type": "MESSAGE"
  }
}
```

Do not manufacture business facts that are absent from the request/history.

## 6. Result: `CLARIFICATION`

```ts
type ClarificationQuestion = {
  id: string;
  field: string;
  question: string;
  inputType: "text" | "choice" | "email" | "datetime" | "number";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
};

type ClarificationResult = {
  type: "CLARIFICATION";
  draft: {
    id: string;
    kind: "TASK" | "MEETING";
    payload: Record<string, unknown>;
  };
  questions: ClarificationQuestion[];
};
```

Example:

```json
{
  "schemaVersion": "1.0",
  "turnId": "chat-turn-6acc73f1c89621797405eb83",
  "conversationId": "6acc7392c89621797405eb70",
  "inReplyToMessageId": "6acc73f1c89621797405eb83",
  "reply": {
    "id": "chat-reply-6acc73f1c89621797405eb83-v1",
    "content": "What exact time should the meeting start, and what is Amit's email address?",
    "agent": {
      "id": "6aa51d409e98784ad526525a",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    }
  },
  "result": {
    "type": "CLARIFICATION",
    "draft": {
      "id": "chat-draft-meeting-001",
      "kind": "MEETING",
      "payload": {
        "platform": "GOOGLE_MEET",
        "title": "Meeting with Amit",
        "durationMinutes": 30,
        "timezone": "Asia/Dhaka",
        "sendBot": true
      }
    },
    "questions": [
      {
        "id": "meeting-start-time",
        "field": "startsAt",
        "question": "What exact time should the meeting start?",
        "inputType": "datetime",
        "required": true
      },
      {
        "id": "invitee-email-amit",
        "field": "invitees",
        "question": "What email address should be used to invite Amit?",
        "inputType": "email",
        "required": true
      }
    ]
  }
}
```

Clarification behavior:

- ask only information needed to complete the intended proposal;
- include only known fields in `draft.payload`;
- omit missing values rather than using empty/fake placeholders;
- keep `draft.id` stable across all clarification turns;
- never invent an email or Main Backend user ID;
- if multiple pending drafts exist and the answer is ambiguous, ask which
  draft the organizer means;
- the organizer's answer arrives later as a normal request to the same route;
- locate the matching draft in `pendingDrafts` and continue it.

Example later organizer message:

```text
Use amit@example.com and schedule it tomorrow at 3 PM.
```

No separate refinement endpoint is required for this chat flow.

## 7. Result: `TASK_PROPOSAL`

```ts
type TaskProposalPayload = {
  title: string;
  description?: string;
  assignedToUserId?: string;
  department?:
    | "SALES"
    | "FINANCE"
    | "OPERATIONS"
    | "STRATEGY"
    | "SUPPORT"
    | "DESIGN"
    | "MARKETING"
    | "OTHER";
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: string;
  estimatedDurationMinutes?: number;
  stakeholderIds?: string[];
  dependencies?: object[];
  requiredAttachments?: object[];
  reminder?: object;
  subtasks?: object[];
  tags?: string[];
};

type TaskProposalResult = {
  type: "TASK_PROPOSAL";
  draftId: string;
  proposal: TaskProposalPayload;
};
```

Example:

```json
{
  "schemaVersion": "1.0",
  "turnId": "chat-turn-6acc7418c89621797405eba1",
  "conversationId": "6acc7392c89621797405eb70",
  "inReplyToMessageId": "6acc7418c89621797405eba1",
  "reply": {
    "id": "chat-reply-6acc7418c89621797405eba1-v1",
    "content": "The task proposal is ready for your review.",
    "agent": {
      "id": "6aa51d409e98784ad526525a",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    }
  },
  "result": {
    "type": "TASK_PROPOSAL",
    "draftId": "chat-draft-task-001",
    "proposal": {
      "title": "Prepare the client proposal",
      "description": "Prepare and review it before the client call.",
      "department": "SALES",
      "priority": "HIGH",
      "dueDate": "2026-10-19T11:00:00.000Z",
      "estimatedDurationMinutes": 90,
      "tags": ["client", "proposal"]
    }
  }
}
```

Task rules:

- `title` is required;
- ask clarification when required intent is missing;
- do not invent `assignedToUserId` or `stakeholderIds`;
- ISO dates must represent the organizer's stated timezone correctly;
- do not return task execution status;
- do not say the task was created—say it is ready for review.

## 8. Result: `MEETING_PROPOSAL`

```ts
type MeetingProposalPayload = {
  platform: "ZOOM" | "GOOGLE_MEET";
  title: string;
  agenda?: string;
  startsAt: string;
  durationMinutes?: number;
  timezone: string;
  invitees?: string[];
  reminderMinutesBeforeStart?: number;
  sendBot?: boolean;
  botName?: string;
};

type MeetingProposalResult = {
  type: "MEETING_PROPOSAL";
  draftId: string;
  proposal: MeetingProposalPayload;
};
```

Example:

```json
{
  "schemaVersion": "1.0",
  "turnId": "chat-turn-6acc7424c89621797405eba9",
  "conversationId": "6acc7392c89621797405eb70",
  "inReplyToMessageId": "6acc7424c89621797405eba9",
  "reply": {
    "id": "chat-reply-6acc7424c89621797405eba9-v1",
    "content": "The meeting proposal is ready for your review.",
    "agent": {
      "id": "6aa51d409e98784ad526525a",
      "name": "Laura",
      "type": "CHIEF_OF_STAFF"
    }
  },
  "result": {
    "type": "MEETING_PROPOSAL",
    "draftId": "chat-draft-meeting-001",
    "proposal": {
      "platform": "GOOGLE_MEET",
      "title": "Meeting with Amit",
      "agenda": "Discuss the project plan and next steps.",
      "startsAt": "2026-10-18T09:00:00.000Z",
      "durationMinutes": 30,
      "timezone": "Asia/Dhaka",
      "invitees": ["amit@example.com"],
      "reminderMinutesBeforeStart": 15,
      "sendBot": true,
      "botName": "Noltra AI Notetaker"
    }
  }
}
```

Meeting rules:

- `platform` must be `ZOOM` or `GOOGLE_MEET`;
- `title`, `startsAt`, and `timezone` are required for a ready proposal;
- `startsAt` must contain `Z` or an explicit UTC offset;
- `timezone` must be an IANA timezone such as `Asia/Dhaka`;
- invitees are explicitly provided email addresses;
- if the invitee email is missing, return `CLARIFICATION`;
- if exact date/time or platform is missing, return `CLARIFICATION`;
- do not perform CRM lookup in this phase;
- do not say the meeting was scheduled—say it is ready for review.

## 9. Conversation history access

Main Backend normally includes the most recent messages in every request.
When `historyPage.hasOlder` is true and older context is genuinely required,
AI may call the supplied `olderMessagesPath`:

```http
GET {MAIN_BACKEND_URL}{olderMessagesPath}
x-ai-actions-secret: <shared-service-secret>
```

Expected interface:

```http
GET /api/v1/ai-internal/organizations/{organizationId}/conversations/{conversationId}/messages?limit=50&cursor={cursor}
```

```json
{
  "conversation": {
    "id": "6acc7392c89621797405eb70",
    "organizationId": "6ab750484438958c8b717d1e",
    "status": "ACTIVE"
  },
  "items": [
    {
      "id": "6acc73d9c89621797405eb70",
      "senderType": "USER",
      "content": "I need to speak with Amit",
      "createdAt": "2026-10-17T06:08:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "hasMore": true,
    "nextCursor": "opaque-older-message-cursor"
  }
}
```

AI history rules:

- use recent pushed history first;
- fetch older pages only when necessary;
- never download an unbounded conversation on every turn;
- preserve chronological interpretation;
- never call the public user-JWT message route;
- do not trust or modify tenant identity from history responses;
- do not persist Main Backend history as a new source of truth.

## 10. Idempotency and concurrency

AI Backend must use durable/shared idempotency storage, not process memory.

Required behavior:

- same `idempotencyKey` and identical canonical request: return the same
  logical response;
- same key with different canonical request: return HTTP `409`;
- reply ID and draft ID remain stable on replay;
- concurrent duplicates do not create divergent replies;
- include conversation ID, message ID, selected agent, history/drafts, and
  context in the canonical input fingerprint;
- do not reorder messages supplied in the request;
- never update an older draft revision over a newer one.

## 11. Error contract

Return a bounded non-sensitive JSON error:

```json
{
  "code": "INVALID_CHAT_REQUEST",
  "message": "The chat turn request is invalid",
  "retryable": false
}
```

| HTTP | Meaning | Retryable |
| --- | --- | --- |
| `400` | Invalid request contract | No |
| `401` | Missing/invalid service secret | No |
| `409` | Idempotency key conflict | No |
| `422` | Cannot safely produce a valid result | No |
| `408` | Processing timeout | Yes |
| `429` | Rate limited | Yes |
| `500+` | Model/orchestrator unavailable | Yes |

Do not return `200` with malformed fallback JSON. Do not expose prompts,
secrets, stack traces, complete private history, or other tenant data.

## 12. Recommended AI implementation

Use one reusable chat-turn pipeline:

```text
authenticate request
  -> validate request schema
  -> enforce durable idempotency
  -> load recent/optional older history
  -> resolve relevant pending draft
  -> understand organizer intent
  -> detect missing required fields
  -> generate natural-language reply
  -> generate exactly one result type
  -> validate output
  -> return raw JSON
```

Recommended components:

- `AiChatTurnRequest` validator;
- `AiChatTurnResponse` discriminated-union validator;
- shared `AgentIdentity` model;
- conversation-context loader;
- pending-draft resolver;
- clarification-question builder;
- task proposal validator;
- meeting proposal validator;
- durable idempotency repository;
- final response validator.

Do not create separate routes for message, clarification, task, and meeting.
They are result types returned by the same chat engine.

## 13. AI Backend acceptance tests

### Authentication and transport

- Missing/wrong shared secret returns `401`.
- Success response is raw JSON.
- Dedicated chat route does not call `analyze-source`.

### Identity

- Response echoes turn, conversation, and message IDs exactly.
- Response agent exactly matches selected agent.
- Every success has non-empty reply content.

### Normal chat

- Greeting returns `MESSAGE`.
- General question returns `MESSAGE`.
- Missing business facts are not invented.

### Clarification

- Missing meeting email returns an email question.
- Missing exact time returns a datetime question.
- Partial payload contains only known values.
- Draft ID remains stable over multiple turns.
- Later organizer answer completes the matching draft.
- Ambiguous answer with multiple drafts requests clarification.

### Task

- Complete request returns `TASK_PROPOSAL`.
- Proposal always has a title.
- Internal user IDs are never guessed.
- Reply says ready for review, not created.

### Meeting

- Complete request returns `MEETING_PROPOSAL`.
- Platform, ISO time, IANA timezone, and supplied email validate.
- Email is never guessed.
- Reply says ready for review, not scheduled.

### History and idempotency

- USER and AI history is interpreted chronologically.
- Older pages are fetched only when required.
- Identical retry returns stable IDs and content.
- Changed input with same key returns `409`.
- Concurrent duplicate turns do not diverge.

## 14. Main Backend interfaces assumed by AI

The AI team does not implement these interfaces. They are listed only so the
AI implementation knows what Main Backend will supply or consume.

Main Backend will:

- create and own `conversationId` and message IDs;
- validate and supply `selectedAgent`;
- supply recent history and pending drafts;
- expose `olderMessagesPath` when older history is available;
- persist `reply` as an AI message linked to `inReplyToMessageId`;
- validate and persist clarification/task/meeting results;
- let the organizer edit and approve proposals;
- execute approved tasks and meetings;
- deliver results to Frontend through polling.

The AI Backend only needs to implement the dedicated route, schemas, behavior,
idempotency, and tests defined above.
