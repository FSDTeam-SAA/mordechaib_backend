# AI Backend Unified Structured Chat Streaming Handoff

## 1. Goal

This document defines the AI Backend change required by Noltra Main Backend for
the persisted **Ask Laura** message flow.

One AI request must provide all of the following from one model execution:

- live Server-Sent Events (SSE) progress;
- streamed temporary answer text;
- conversation history and pending-draft awareness;
- PDF, DOCX, and image understanding;
- organizer-scoped customer/CRM and calendar lookups;
- clarification handling;
- task, meeting, and CRM-record-update proposals; and
- one final structured `AiChatTurnResponse`.

The existing AI routes currently split these capabilities:

| Existing route         | Current capability                                                                    | Gap                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /api/v1/chat`    | SSE, files, multi-agent read-only chat                                                | Does not consume the structured conversation request or return structured proposals                |
| `POST /api/v1/ai/chat` | Conversation context, drafts, customer/calendar grounding, task and meeting proposals | Returns one JSON response; no SSE or multipart files; CRM update result is missing from its schema |

Do not call both routes for the same organizer message. That would run the AI
twice and could produce two different answers. Instead, extend the existing
structured route so one execution streams progress and finishes with the same
structured response.

## 2. Canonical endpoint

Extend this existing endpoint:

```http
POST /api/v1/ai/chat
```

It must support both transports without changing its business contract:

| Request header                                     | Response                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `Accept: text/event-stream`                        | SSE stream ending in one structured `result` event                |
| `Accept: application/json` or no SSE accept header | Existing raw JSON `AiChatTurnResponse` for backward compatibility |

It must accept either:

- `Content-Type: application/json`; or
- `Content-Type: multipart/form-data` when files are included.

Do not make `/api/v1/chat` the proposal endpoint and do not internally call one
chat route from the other. Reuse the structured chat engine directly.

## 3. Authentication

This is a Main Backend-to-AI Backend service endpoint.

Canonical authentication:

```http
x-ai-actions-secret: <shared-service-secret>
```

Validate it with constant-time comparison. Do not log the secret, user JWT,
message history, or raw uploaded files.

If the deployment temporarily forwards `Authorization: Bearer <user-token>`,
that may remain as a migration compatibility mechanism, but it must not replace
the service-secret contract. Internal customer/calendar calls must use the
shared service secret and the request's authorized requester identity.

## 4. Structured request contract

The JSON request remains the existing `AiChatTurnRequest`:

```ts
type AgentIdentity = {
  id: string;
  name: string;
  type: string;
  imageUrl?: string;
};

type ChatMessage = {
  id: string;
  senderType: 'USER' | 'AI' | 'SYSTEM';
  content: string;
  createdAt: string;
  sourceMessageId?: string;
  agent?: AgentIdentity;
};

type ClarificationQuestion = {
  id: string;
  field: string;
  question: string;
  inputType: 'text' | 'choice' | 'email' | 'datetime' | 'number';
  required: boolean;
  options?: Array<{ label: string; value: string }>;
};

type PendingDraft = {
  id: string;
  kind: 'TASK' | 'MEETING' | 'CRM_RECORD_UPDATE';
  status: 'NEEDS_CLARIFICATION' | 'READY';
  revision: number;
  payload: Record<string, unknown>;
  questions?: ClarificationQuestion[];
};

type AiChatTurnRequest = {
  schemaVersion: '1.0';
  turnId: string;
  idempotencyKey: string;
  organizationId: string;
  requester: {
    userId: string;
    name: string;
  };
  conversation: {
    id: string;
    title: string;
    selectedAgent: AgentIdentity;
  };
  message: ChatMessage & { senderType: 'USER' };
  recentMessages: ChatMessage[];
  historyPage: {
    included: number;
    hasOlder: boolean;
    olderMessagesCursor: string | null;
    olderMessagesPath?: string;
  };
  pendingDrafts: PendingDraft[];
  context: {
    effectiveTimezone: string;
    language: string;
    currentTime: string;
  };
};
```

Request rules:

- `message` is the authoritative current organizer message.
- `recentMessages` is chronological and contains USER and AI history.
- `conversation.selectedAgent` is authoritative and must be echoed exactly.
- `pendingDrafts` allows later organizer messages to finish existing work.
- Date phrases must be resolved using `context.currentTime` and
  `context.effectiveTimezone`.
- `requester.userId` is the only requester identity allowed in internal context
  calls. It is required and is derived by Main Backend from the persisted
  organizer message sender, which originated from the authenticated JWT.
  Never accept a requester identity from generated model output or a frontend
  request field.
- The current message may appear in history no more than once.

## 5. Multipart request contract

When files exist, Main Backend sends the same logical request as multipart.
Every previous top-level request property keeps its field name.

- Plain string values are sent directly.
- Objects and arrays are JSON-encoded strings.
- Files use repeated `files` parts.
- The multipart form must be converted back into the exact
  `AiChatTurnRequest` before normal validation and fingerprinting.

Example:

```http
POST /api/v1/ai/chat
Accept: text/event-stream
x-ai-actions-secret: <shared-service-secret>
Content-Type: multipart/form-data; boundary=<generated-boundary>
```

```text
schemaVersion = 1.0
turnId = chat-turn-6ad98d2badd382b9eb0fe947
idempotencyKey = chat-turn-6ad98d2badd382b9eb0fe947
organizationId = 6a7d637faaab59e0624cde06
requester = {"userId":"6a7d...","name":"Mahabur"}
conversation = {"id":"6ad98...","title":"New Chat","selectedAgent":{...}}
message = {"id":"6ad98...","senderType":"USER","content":"Review this file","createdAt":"..."}
recentMessages = [{...}]
historyPage = {"included":4,"hasOlder":false,"olderMessagesCursor":null}
pendingDrafts = []
context = {"effectiveTimezone":"Asia/Dhaka","language":"en","currentTime":"..."}
files = <binary file 1>
files = <binary file 2>
```

Main Backend encodes the multipart body itself (`AiStreamingClient`), so every
upload carries `Content-Type` with its boundary and an exact `Content-Length`.
The AI Backend requires that header and answers `411 LENGTH_REQUIRED` without it.

File limits must match Main Backend:

- at most 5 files;
- at most 20 MB combined;
- PDF: `application/pdf`;
- DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
- images: PNG, JPEG, WEBP, or GIF.

Validate file type from bytes, not filename alone. Reject encrypted,
malformed, empty, unsupported, over-count, or oversized uploads before starting
the SSE response. Extract document text with bounded output. Images may be sent
to a vision-capable model. The current message and its attachments must be part
of the same model turn.

Files are temporary inputs. AI Backend must not become the storage authority;
Main Backend already owns the private persisted attachments.

## 6. SSE response contract

For `Accept: text/event-stream`, successful response headers must include:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

Allowed events:

### `activity`

Temporary progress for the frontend:

```text
event: activity
data: {"stage":"planning","agent":"chief_of_staff","message":"Reviewing the request"}

```

Recommended stages:

```text
planning
delegating
tool_started
tool_finished
agent_finished
reviewing
```

Activity must be truthful and bounded. Do not expose chain-of-thought, hidden
reasoning, prompts, secrets, raw tool credentials, or private unrelated data.

### `text_delta`

Temporary user-visible answer fragment:

```text
event: text_delta
data: {"text":"I can help schedule"}

```

### `text_reset`

Tells the frontend to discard streamed preamble:

```text
event: text_reset
data: {}

```

### Keep-alive comment

Send at least once every 15 seconds while no other event is emitted:

```text
: ping

```

### `result`

Exactly one successful terminal event. Its `data` must be the complete existing
`AiChatTurnResponse`, not the `/api/v1/chat` `ChatResponse` model:

```text
event: result
data: {"schemaVersion":"1.0","turnId":"...","conversationId":"...","inReplyToMessageId":"...","reply":{...},"result":{"type":"MESSAGE"}}

```

### `error`

Exactly one failure terminal event after streaming has begun:

```text
event: error
data: {"code":"MODEL_UNAVAILABLE","message":"The chat model is unavailable","retryable":true}

```

The stream must end immediately after `result` or `error`. Never emit both.
Validation/authentication/upload errors detected before headers are committed
must remain normal bounded JSON HTTP errors.

## 7. Final structured response

```ts
type AiChatTurnResponse = {
  schemaVersion: '1.0';
  turnId: string;
  conversationId: string;
  inReplyToMessageId: string;
  reply: {
    id: string;
    content: string;
    agent: AgentIdentity;
  };
  result:
    | { type: 'MESSAGE' }
    | ClarificationResult
    | TaskProposalResult
    | MeetingProposalResult
    | CrmRecordUpdateProposalResult;
};
```

The following values must echo the request exactly:

- `schemaVersion`;
- `turnId`;
- `conversationId`;
- `inReplyToMessageId` = `message.id`;
- the complete selected agent identity.

`reply.id`, draft IDs, content, and final result must remain stable on an
idempotent replay. The final reply is authoritative; streamed deltas are only
temporary UI content.

## 8. Result types

### `MESSAGE`

```json
{ "type": "MESSAGE" }
```

Use for ordinary questions or answers that do not create/continue a proposal.

### `CLARIFICATION`

```json
{
  "type": "CLARIFICATION",
  "draft": {
    "id": "chat-draft-meeting-001",
    "kind": "MEETING",
    "payload": {
      "title": "Meeting with Tauhid",
      "timezone": "Asia/Dhaka"
    }
  },
  "questions": [
    {
      "id": "meeting-start-time",
      "field": "startsAt",
      "question": "What exact date and time should the meeting start?",
      "inputType": "datetime",
      "required": true
    }
  ]
}
```

Allowed draft kinds:

```text
TASK
MEETING
CRM_RECORD_UPDATE
```

Ask only for information required to safely complete the proposal. Preserve
the draft ID across clarification turns.

### `TASK_PROPOSAL`

```json
{
  "type": "TASK_PROPOSAL",
  "draftId": "chat-draft-task-001",
  "proposal": {
    "title": "Prepare the client proposal",
    "description": "Prepare it before the customer meeting.",
    "customerId": "6af100000000000000000001",
    "department": "SALES",
    "priority": "HIGH",
    "dueDate": "2026-11-15T11:00:00.000Z",
    "estimatedDurationMinutes": 90,
    "tags": ["client", "proposal"]
  }
}
```

Never invent internal user or stakeholder IDs. Say the proposal is ready for
review; never claim that a task was created.

`customerId` is optional, but when the task is about a resolved customer it
must contain the exact Main Backend customer ID returned by the authorized
customer lookup. It must never contain a CRM provider record ID, email address,
name, or model-generated identifier.

### `MEETING_PROPOSAL`

```json
{
  "type": "MEETING_PROPOSAL",
  "draftId": "chat-draft-meeting-001",
  "proposal": {
    "platform": "GOOGLE_MEET",
    "title": "Meeting with Tauhid",
    "customerId": "6af100000000000000000001",
    "agenda": "Discuss next steps.",
    "startsAt": "2026-11-15T09:00:00.000Z",
    "durationMinutes": 30,
    "timezone": "Asia/Dhaka",
    "invitees": ["tauhid@example.com"],
    "sendBot": true
  }
}
```

Required fields are `platform`, `title`, `startsAt`, and `timezone`. Invitee
emails must be organizer-supplied or explicitly confirmed CRM matches. If the
time, platform, or required email is unresolved, return `CLARIFICATION`.

`customerId` is optional, but must be included when the organizer has confirmed
an exact Main Backend customer. Preserve the same ID in clarification draft
payloads and the completed proposal. Do not infer it from an email address.

### `CRM_RECORD_UPDATE_PROPOSAL`

This result is required; it is missing from the cloned AI Backend's current
`AiChatTurnResponse` schema.

```ts
type CrmRecordUpdateProposalResult = {
  type: 'CRM_RECORD_UPDATE_PROPOSAL';
  draftId: string;
  proposal: {
    provider: 'HUBSPOT' | 'SALESFORCE';
    objectType: string;
    externalId: string;
    properties: Record<string, unknown>;
    expectedProviderUpdatedAt?: string;
  };
};
```

Example:

```json
{
  "type": "CRM_RECORD_UPDATE_PROPOSAL",
  "draftId": "chat-draft-crm-product-001",
  "proposal": {
    "provider": "HUBSPOT",
    "objectType": "products",
    "externalId": "123456",
    "properties": { "price": 125 },
    "expectedProviderUpdatedAt": "2026-11-13T06:00:00.000Z"
  }
}
```

CRM rules:

- resolve the provider, object, record, and writable schema from Main Backend;
- ask clarification for ambiguous matches;
- include only changed properties;
- use authoritative field names, types, and enum values;
- never call HubSpot or Salesforce directly;
- never execute the update or claim it was executed.

Main Backend remains the validation, approval, and execution authority.

## 8.1 Customer linkage contract

Customer linkage is separate from display text and invitee email:

```ts
type CustomerLinkedTaskProposal = TaskProposalPayload & {
  customerId?: string;
};

type CustomerLinkedMeetingProposal = MeetingProposalPayload & {
  customerId?: string;
};
```

Rules:

- use only the exact `customerId` returned by the organization- and
  requester-scoped Main Backend customer lookup;
- require organizer confirmation before choosing among customer matches;
- a single search match must also be confirmed when identity is not already
  unambiguous from the active conversation/draft;
- never create or guess a customer ID;
- never put a HubSpot/Salesforce `externalId` in `customerId`;
- preserve a confirmed ID across clarification turns;
- omit `customerId` when no existing Main Backend customer was resolved;
- do not block an ordinary non-customer task solely because it has no
  `customerId`.

Main Backend supports this field at the AI proposal boundary. It validates the
customer against the proposal organization, preserves `customerId` in the
proposal, and maps it to the existing task/meeting `contactIds` relationship
when an approved proposal is executed. AI Backend may emit the field after the
Main Backend release containing that support is deployed.

## 9. Customer, CRM, calendar, and history grounding

When `requester.userId` is available, reuse the existing AI-internal read-only
context routes. Send `x-ai-actions-secret` on every call and preserve the
request organization and requester scope.

Customer/calendar context:

```http
GET /api/v1/ai-internal/organizations/{organizationId}/customers
GET /api/v1/ai-internal/organizations/{organizationId}/customers/{customerId}
GET /api/v1/ai-internal/organizations/{organizationId}/calendar/events
GET /api/v1/ai-internal/organizations/{organizationId}/calendar/availability
```

Each route requires `requesterUserId=<requester.userId>` plus its documented
filters. Customer matches, even a single match, must be confirmed before using
an email address for a proposal.

Dynamic CRM context:

```http
GET /api/v1/ai-internal/organizations/{organizationId}/crm/{provider}/objects
GET /api/v1/ai-internal/organizations/{organizationId}/crm/{provider}/objects/{objectType}/schema
GET /api/v1/ai-internal/organizations/{organizationId}/crm/{provider}/objects/{objectType}/records?page=1&limit=20
```

Older chat history may be fetched only when `historyPage.hasOlder=true`, using
the supplied `olderMessagesPath`. Do not download unbounded history on every
turn and do not persist Main Backend data as a second source of truth.

## 10. Persistence and execution boundaries

AI Backend must not persist or execute Main Backend business resources.

AI Backend may persist only durable idempotency state required to replay the
same logical response safely.

Main Backend owns:

- conversations and user/AI messages;
- private attachment storage;
- proposal persistence and revisions;
- organizer approval;
- task creation;
- meeting scheduling;
- CRM updates; and
- final status and audit records.

AI Backend owns:

- request validation;
- safe attachment interpretation;
- context-aware reasoning;
- temporary SSE progress;
- clarification generation;
- grounded proposal generation;
- final response validation; and
- durable idempotency.

## 11. Idempotency and cancellation

Idempotency must apply across JSON and SSE transports.

- Same `organizationId` + `idempotencyKey` + identical canonical input returns
  the same logical response and stable reply/draft IDs.
- Same key with different canonical input returns HTTP `409` before streaming.
- Include structured fields, requester, attachment content hashes, and
  attachment metadata in the canonical fingerprint.
- Concurrent duplicates must not run divergent model executions.
- A completed replay in SSE mode may replay the stored terminal `result`; it
  does not need to reproduce identical timing of temporary events.
- On client disconnect, cancel active model/tool work promptly.
- Cancellation must not store a partial successful result.

Durable/shared idempotency storage is required for multiple replicas;
process-local memory alone is insufficient.

## 12. Error contract

Before the stream starts, return bounded JSON:

```json
{
  "code": "INVALID_CHAT_REQUEST",
  "message": "The chat turn request is invalid",
  "retryable": false
}
```

| HTTP   | Meaning                                                            | Retryable |
| ------ | ------------------------------------------------------------------ | --------- |
| `400`  | Invalid request or multipart field                                 | No        |
| `401`  | Invalid service secret                                             | No        |
| `409`  | Idempotency conflict                                               | No        |
| `411`  | Multipart request has no content length, if required by deployment | No        |
| `413`  | Upload limits exceeded                                             | No        |
| `415`  | Unsupported file type                                              | No        |
| `422`  | Cannot safely produce a valid result                               | No        |
| `408`  | Timeout                                                            | Yes       |
| `429`  | Rate limited                                                       | Yes       |
| `500+` | Model/orchestrator unavailable                                     | Yes       |

After SSE headers are committed, emit one terminal `error` event and close the
stream. Never put stack traces, prompts, secrets, or complete private history
in an error.

## 13. Reusable implementation structure

Use one chat-turn pipeline shared by JSON and SSE transports:

```text
authenticate
  -> parse JSON or multipart into AiChatTurnRequest
  -> validate request and files
  -> claim durable idempotency key
  -> load optional history/customer/calendar/CRM context
  -> resolve pending draft and organizer intent
  -> run one structured chat engine with an optional event sink
  -> validate one AiChatTurnResponse
  -> store idempotent final result
  -> return JSON or emit terminal SSE result
```

Recommended reusable components:

- `AiChatTurnRequest` parser/validator;
- multipart-to-structured-request parser;
- bounded attachment reader;
- structured chat engine independent of HTTP transport;
- optional SSE event sink;
- pending-draft resolver;
- customer/calendar/CRM context client;
- task, meeting, and CRM proposal validators;
- final discriminated-union validator;
- durable idempotency repository; and
- JSON/SSE response adapters.

Do not duplicate the structured engine inside `/api/v1/chat` and
`/api/v1/ai/chat`.

## 14. Acceptance tests

### Transport

- JSON request without SSE accept returns the existing raw JSON response.
- JSON request with SSE accept returns `text/event-stream`.
- Multipart request with SSE accept parses the complete structured request.
- SSE sends progress before the terminal event on a non-trivial turn.
- A keep-alive comment is sent within every 15-second idle interval.
- Exactly one terminal `result` or `error` is emitted.

### Contract

- IDs and selected agent echo the request exactly.
- Terminal `result` validates as `AiChatTurnResponse` without adaptation.
- Greeting returns `MESSAGE`.
- Missing meeting information returns `CLARIFICATION`.
- Complete task request returns `TASK_PROPOSAL`.
- Complete meeting request returns `MEETING_PROPOSAL`.
- Grounded CRM edit returns `CRM_RECORD_UPDATE_PROPOSAL`.
- AI never claims a task, meeting, or CRM change was executed.

### Context

- USER and AI history are interpreted chronologically.
- A pending draft continues with the same draft ID.
- Customer lookup is requester- and organization-scoped.
- A CRM-derived invitee is confirmed before use.
- Calendar-relative dates use the supplied timezone and current time.
- Older history is fetched only when required.

### Attachments

- PDF, DOCX, PNG, JPEG, WEBP, and GIF happy paths work.
- Attachment-only turn works.
- Unsupported, malformed, encrypted, empty, oversized, and excess files fail
  before SSE begins.
- File contents affect the same final structured response.
- Raw files and extracted private content are not logged.

### Reliability

- Identical replay returns stable IDs and the same final result.
- Changed input with the same key returns `409`.
- Concurrent duplicates do not diverge.
- Client disconnect cancels active work.
- Model timeout/rate limit produces a bounded retryable failure.

## 15. End-to-end verification

After deployment, configure Main Backend to use:

```ini
AI_CHAT_STREAM_PATH=/api/v1/ai/chat
```

Then test only the public Main Backend route:

```bash
curl -N -X POST http://localhost:5000/api/v1/messages \
  -H "Authorization: Bearer <user-token>" \
  -H "Accept: text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "startNewConversation": true,
    "clientMessageId": "f7021e38-5674-4a18-9580-10a843a1f876",
    "content": "Schedule a Google Meet with Tauhid tomorrow at 3 PM"
  }'
```

Expected sequence:

```text
message_created        Main Backend persisted the organizer message
activity/text_delta    AI Backend temporary progress; not persisted
result                 structured response, forwarded only after Main Backend persistence
stream closes
```

Verify four separate turns:

1. a normal business question -> `MESSAGE`;
2. an incomplete meeting request -> `CLARIFICATION`;
3. the clarification answer -> `MEETING_PROPOSAL`;
4. a grounded CRM edit -> `CRM_RECORD_UPDATE_PROPOSAL`.

Successful completion means one AI call produces streaming UX and the same
structured final contract that Main Backend already validates and persists.
