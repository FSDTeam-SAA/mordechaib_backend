# AI Chief of Staff and Email Frontend API Guide

Version: 1.0  
Last reviewed against Main Backend: 2026-09-23

## 1. Purpose and scope

This is the frontend implementation contract for the currently implemented AI Chief of Staff UI and owner email workflow. A frontend developer should be able to implement these screens without reading Main Backend code:

- authentication bootstrap;
- recent conversations and chat messages;
- asynchronous AI replies;
- meeting/task action proposals;
- sequential clarification questions;
- proposal approve, reject, and retry;
- Google Meet/Zoom connection and created-meeting verification;
- Google/Outlook email connection;
- platform email draft, review, edit, and explicit send;
- Today's Briefing, Team Challenges, and Weekly Review;
- agent catalog, runtime activity, and AI health;
- CEO strategic notes;
- notification bell and integration cards.

Only the canonical routes in this document should be used. The frontend must not call AI Backend directly and must not use old `/ai-actions/...` compatibility routes.

## 2. API conventions

### 2.1 Base URLs

Local defaults:

```text
API:     http://localhost:5000/api/v1
Swagger: http://localhost:5000/api/docs
```

Use the deployed Main Backend URL in non-local environments. Do not hard-code the local URL.

### 2.2 Authentication and organization

Every route in this document requires a bearer token except OAuth callbacks handled by the provider:

```http
Authorization: Bearer <accessToken>
```

The organization comes from the authenticated token. `x-organization-id` is optional; if supplied, it must equal the organization in the token. It cannot be used to switch organizations.

### 2.3 Successful response envelope

Normal JSON responses are wrapped by Main Backend:

```json
{
  "success": true,
  "data": {}
}
```

Examples below normally show the value inside `data` to keep them readable.

OAuth callback routes return an HTTP redirect and are not wrapped.

### 2.4 Error envelope

```json
{
  "success": false,
  "statusCode": 409,
  "message": "The proposal is not awaiting an AI response",
  "path": "/api/v1/call-intelligence/proposals/PROPOSAL_ID/clarifications",
  "timestamp": "2026-09-23T10:00:00.000Z"
}
```

`message` can be a string or an array of validation messages.

Frontend handling:

- `400`: invalid request; show field/request feedback;
- `401`: session expired; refresh or return to login;
- `403`: role or organization access denied;
- `404`: resource no longer exists or is not visible;
- `409`: stale/invalid state; re-fetch the resource before another action;
- `429`: rate limited; wait before retrying;
- `5xx`: service/provider problem; retain the user's unsent input and show retry guidance.

### 2.5 Roles

| Capability                                 | Roles                      |
| ------------------------------------------ | -------------------------- |
| Chat create/send                           | `OWNER`, `ADMIN`, `MEMBER` |
| Proposal clarification/action              | `OWNER`, `ADMIN`           |
| Executive Briefings                        | `OWNER`, `ADMIN`           |
| Strategic notes                            | `OWNER`, `ADMIN`           |
| Meeting connect/create/manage              | `OWNER`, `ADMIN`           |
| Email connect/draft/send                   | `OWNER` only               |
| Read agents/integrations/own notifications | authenticated user         |

Hide or disable controls the current role cannot use; still treat backend authorization as authoritative.

### 2.6 Client-generated idempotency values

The frontend generates these values once per logical operation:

```ts
const id = crypto.randomUUID();
```

| Field                    | Rule                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `clientMessageId`        | New UUID for a new chat message. Reuse the same UUID when retrying that same HTTP request.          |
| `clientDraftId`          | New UUID for a manually created email draft. Reuse it when retrying the same create request.        |
| meeting `idempotencyKey` | New stable string/UUID for a direct meeting create. Reuse it when retrying the same create request. |

Do not generate a new idempotency value after an ambiguous network error; doing so can create duplicates.

## 3. Canonical route map

| UI purpose                   | Method and path                                               |
| ---------------------------- | ------------------------------------------------------------- |
| Login                        | `POST /auth/login`                                            |
| Current profile              | `GET /auth/me`                                                |
| List recent chats            | `GET /messages/conversations`                                 |
| Create New Chat              | `POST /messages/conversations`                                |
| Latest chat                  | `GET /messages/conversation`                                  |
| Send user message            | `POST /messages`                                              |
| Read chat messages           | `GET /messages`                                               |
| Get one message              | `GET /messages/:messageId`                                    |
| Attachment download          | `GET /messages/:messageId/attachments/:attachmentId/download` |
| Delete own message           | `DELETE /messages/:messageId`                                 |
| List proposals               | `GET /call-intelligence/proposals`                            |
| Get one proposal             | `GET /call-intelligence/proposals/:id`                        |
| Answer clarification         | `POST /call-intelligence/proposals/:id/clarifications`        |
| Approve/reject/retry         | `POST /call-intelligence/proposals/:id/action`                |
| List meetings                | `GET /meetings`                                               |
| Get created meeting          | `GET /meetings/:id`                                           |
| Meeting provider connections | provider routes in section 7                                  |
| List email connections       | `GET /email/connections`                                      |
| Connect email provider       | `GET /email/connections/:provider/connect`                    |
| Create/list/read/edit draft  | `/email/drafts` routes in section 8                           |
| Explicitly send draft        | `POST /email/drafts/:id/send`                                 |
| Generate briefing            | `POST /chief-of-staff/briefings/:type/generate`               |
| Poll/read briefing           | `GET /chief-of-staff/briefings/id/:briefingId`                |
| Latest briefing for period   | `GET /chief-of-staff/briefings/:type`                         |
| Strategic notes              | `/chief-of-staff/strategic-notes` routes                      |
| Runtime agent activity       | `GET /chief-of-staff/insights/agent-activity`                 |
| AI runtime health            | `GET /chief-of-staff/insights/ai-health`                      |
| Agent catalog                | `GET /agents`                                                 |
| Integration cards            | `GET /integrations`                                           |
| Notification bell count      | `GET /notifications/unread-count`                             |

## 4. Authentication bootstrap

### 4.1 Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "owner@example.com",
  "password": "your-password",
  "rememberMe": false
}
```

Read `data.accessToken` from the response. Keep the corresponding refresh token according to the application's existing auth storage policy.

### 4.2 Load current identity

```http
GET /auth/me
Authorization: Bearer <accessToken>
```

Use the returned `id`, `organizationId`, `role`, name, avatar, language, and timezone for permissions and display. Do not infer role from visible UI elements.

### 4.3 Recommended screen bootstrap

After authentication, these independent reads may run in parallel:

```text
GET /auth/me
GET /agents?page=1&limit=50
GET /integrations
GET /notifications/unread-count
GET /messages/conversations?page=1&limit=20&status=ACTIVE
```

## 5. Conversation and chat API

### 5.1 Conversation identity

A user can have many conversations. One conversation represents one chat thread. Use the same `conversationId` for all messages and proposal cards belonging to that thread.

### 5.2 List Recent chats

```http
GET /messages/conversations?page=1&limit=20&status=ACTIVE
```

Query:

| Field    | Required | Values/default                               |
| -------- | -------- | -------------------------------------------- |
| `page`   | no       | integer, default `1`                         |
| `limit`  | no       | `1..100`, default `20`                       |
| `status` | no       | currently `ACTIVE` for visible conversations |

Response:

```json
{
  "items": [
    {
      "_id": "6ab3739a1d7fb40b6d4834fc",
      "organizationId": "ORG_ID",
      "createdBy": "USER_ID",
      "title": "Meeting with Tahid",
      "isDefault": false,
      "status": "ACTIVE",
      "totalMessageCount": 4,
      "lastMessageAt": "2026-09-23T08:43:02.280Z",
      "createdAt": "2026-09-23T06:37:14.751Z",
      "updatedAt": "2026-09-23T08:43:02.281Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Conversation records currently expose Mongo `_id`; use it as `conversationId`. Valid conversation statuses are `ACTIVE` and `ARCHIVED`.

### 5.3 Create New Chat

Call only when the user intentionally presses New Chat:

```http
POST /messages/conversations
Content-Type: application/json
```

```json
{
  "title": "Meeting with Tahid"
}
```

`title` is optional, `1..200` characters. It labels the conversation; it is not sent to AI and does not create a message.

Response is the created conversation record. Store its `_id` as the active `conversationId`.

### 5.4 Get the latest conversation

```http
GET /messages/conversation
```

Use this only for a default/latest-chat experience. Use the explicit Recent list and selected conversation ID for the multi-conversation UI.

### 5.5 Send a text message

```http
POST /messages
Content-Type: application/json
```

```json
{
  "conversationId": "6ab3739a1d7fb40b6d4834fc",
  "clientMessageId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "content": "Schedule a meeting with Tahid."
}
```

Rules:

- `conversationId` is a Mongo ID; omit only when intentionally using the latest/default conversation;
- `clientMessageId` is an optional UUID but should always be generated by frontend;
- `content` is optional only when at least one attachment is supplied;
- maximum content length is 20,000 characters;
- limit is 20 send requests per minute.

Immediate response is the persisted user message, not the final AI answer:

```json
{
  "id": "USER_MESSAGE_ID",
  "conversationId": "CONVERSATION_ID",
  "senderId": "USER_ID",
  "senderType": "USER",
  "clientMessageId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "type": "TEXT",
  "content": "Schedule a meeting with Tahid.",
  "attachmentCount": 0,
  "processingStatus": "PENDING",
  "attachments": [],
  "createdAt": "2026-09-23T08:43:02.217Z"
}
```

### 5.6 Send attachments

```http
POST /messages
Content-Type: multipart/form-data
```

Form fields:

```text
conversationId = CONVERSATION_ID
clientMessageId = UUID
content = Optional accompanying text
files = one or more supported files
```

The response contains attachment metadata. To request an authorized download URL:

```http
GET /messages/:messageId/attachments/:attachmentId/download?disposition=inline
```

`disposition` is `inline` or `attachment` and defaults to `inline`. Do not expose or persist the returned short-lived URL beyond its expiry.

### 5.7 Read/poll a conversation

```http
GET /messages?conversationId=CONVERSATION_ID&page=1&limit=30
```

Response:

```json
{
  "conversation": { "_id": "CONVERSATION_ID", "totalMessageCount": 2 },
  "items": [
    {
      "id": "USER_MESSAGE_ID",
      "senderType": "USER",
      "content": "Schedule a meeting with Tahid.",
      "processingStatus": "COMPLETED",
      "attachments": []
    },
    {
      "id": "AI_MESSAGE_ID",
      "senderType": "AI",
      "sourceMessageId": "USER_MESSAGE_ID",
      "content": "I prepared a meeting proposal and need the start time.",
      "processingStatus": "COMPLETED",
      "agentId": "AGENT_ID",
      "agentName": "Laura",
      "agentType": "CHIEF_OF_STAFF",
      "emailDraftId": null,
      "attachments": []
    }
  ],
  "pagination": { "page": 1, "limit": 30, "total": 2, "pages": 1 }
}
```

Fields whose values do not exist may be omitted rather than returned as `null`.

Message processing states:

| Status          | Meaning                        | Frontend behavior                                             |
| --------------- | ------------------------------ | ------------------------------------------------------------- |
| `PENDING`       | AI job queued                  | Show pending indicator and poll.                              |
| `PROCESSING`    | AI worker active               | Show “Laura is working…” and poll.                            |
| `COMPLETED`     | Analysis pipeline completed    | Stop polling that source; refresh messages and proposals.     |
| `FAILED`        | AI processing failed           | Show failure/retry guidance; do not pretend an answer exists. |
| `NOT_REQUESTED` | automation disabled/not queued | Stop polling and show service unavailable.                    |

Recommended polling:

1. Persist and optimistically render the POST response.
2. Poll the message list every 2 seconds while the source message is `PENDING` or `PROCESSING`.
3. Stop after a sensible UI timeout such as 60 seconds, while allowing manual refresh.
4. On `COMPLETED`, refresh both messages and source-filtered proposals.
5. A completed source may have proposals even when AI Backend did not supply an assistant chat message.

### 5.8 Get or delete one message

```http
GET /messages/:messageId
DELETE /messages/:messageId
```

Delete is a soft delete and may also clean up private attachments. The delete response includes:

```json
{
  "messageId": "MESSAGE_ID",
  "deleted": true,
  "cleanupComplete": true
}
```

## 6. AI action proposal and clarification flow

### 6.1 Discover proposals for a chat message

After a user message reaches `COMPLETED`, call:

```http
GET /call-intelligence/proposals?sourceType=USER_MESSAGE&sourceId=USER_MESSAGE_ID&page=1&limit=20
```

Do not use the conversation ID as `sourceId`. The returned proposal contains its own `conversationId` for placement in the chat thread.

Response shape:

```json
{
  "items": [
    {
      "id": "PROPOSAL_MONGO_ID",
      "proposalId": "source-user_message-MESSAGE_ID:meeting-001",
      "conversationId": "CONVERSATION_ID",
      "actionType": "SCHEDULE_MEETING",
      "proposedByAgent": {
        "id": "AGENT_ID",
        "name": "Laura",
        "type": "CHIEF_OF_STAFF"
      },
      "source": { "type": "USER_MESSAGE", "id": "USER_MESSAGE_ID" },
      "payload": {
        "platform": "GOOGLE_MEET",
        "title": "Meeting with Tahid",
        "startsAt": "2026-09-24T09:00:00.000Z",
        "durationMinutes": 30,
        "timezone": "Asia/Dhaka",
        "invitees": ["tahid@example.com"],
        "sendBot": true
      },
      "clarificationQuestions": [],
      "clarificationAnswers": {},
      "revision": 1,
      "status": "PENDING"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

Supported `actionType` values are:

```text
CREATE_TASK
SCHEDULE_MEETING
```

### 6.2 Proposal state machine

```text
NEEDS_CLARIFICATION
  -> answer one question
ANALYZING
  -> NEEDS_CLARIFICATION (more/current revised questions)
  -> PENDING (ready for review)

PENDING
  -> APPROVE -> EXECUTING -> EXECUTED
                         -> FAILED -> RETRY -> EXECUTING
  -> REJECT  -> REJECTED
```

Always re-fetch the proposal after a state-changing request. Never update the state locally beyond temporary loading indicators.

### 6.3 Render clarification in chat

When status is `NEEDS_CLARIFICATION`, render the current unanswered question as an agent bubble/card. Derive unanswered questions by comparing `clarificationQuestions[].id` with keys in `clarificationAnswers`.

Use `inputType` only as a presentation hint:

- `choice`: choice buttons/dropdown;
- `datetime`: date/time input, converted to ISO 8601 with an explicit offset;
- `email`: email input containing only a plain email address;
- other/missing: text input.

Submit exactly one answer:

```http
POST /call-intelligence/proposals/:id/clarifications
Content-Type: application/json
```

```json
{
  "questionId": "meeting-platform",
  "answer": "Google Meet"
}
```

The response normally has `status: "ANALYZING"`. Disable the clarification input and poll:

```http
GET /call-intelligence/proposals/:id
```

Poll every 2 seconds until `NEEDS_CLARIFICATION`, `PENDING`, or a terminal failure is returned. Do not submit multiple clarification requests concurrently. Do not send clarification answers through `/messages` or `/action`.

### 6.4 Review and approve/reject

Show review controls only for `PENDING`.

Approve:

```http
POST /call-intelligence/proposals/:id/action
Content-Type: application/json
```

```json
{
  "action": "APPROVE"
}
```

Reject:

```json
{
  "action": "REJECT",
  "reason": "The proposed time does not work."
}
```

Successful meeting execution response:

```json
{
  "proposal": {
    "id": "PROPOSAL_MONGO_ID",
    "status": "EXECUTED",
    "targetResourceType": "PLATFORM_MEETING",
    "targetResourceId": "MEETING_ID"
  },
  "target": {
    "type": "PLATFORM_MEETING",
    "id": "MEETING_ID"
  }
}
```

The existence of `target.id` plus proposal `EXECUTED` is the authoritative confirmation that the action was created. `APPROVED` alone is not completion.

### 6.5 Retry failed execution

Show Retry only when an already approved proposal has status `FAILED`:

```http
POST /call-intelligence/proposals/:id/action
Content-Type: application/json
```

```json
{
  "action": "RETRY"
}
```

Display `executionError` when present. For an expired provider connection, lead the user through reconnection before Retry.

## 7. Meeting connection and meeting records

### 7.1 Connection routes

| Provider             | Status                                   | Start connection                      | Disconnect                                  |
| -------------------- | ---------------------------------------- | ------------------------------------- | ------------------------------------------- |
| Google Meet/Calendar | `GET /google-meetings/oauth/connection`  | `GET /google-meetings/oauth/connect`  | `DELETE /google-meetings/oauth/connection`  |
| Zoom                 | `GET /zoom-meetings/oauth/connection`    | `GET /zoom-meetings/oauth/connect`    | `DELETE /zoom-meetings/oauth/connection`    |
| Outlook Calendar     | `GET /calendar/outlook/oauth/connection` | `GET /calendar/outlook/oauth/connect` | `DELETE /calendar/outlook/oauth/connection` |

Start-connection response:

```json
{
  "authorizationUrl": "https://provider.example/oauth/..."
}
```

Open `authorizationUrl` in the browser. Do not call provider callback routes manually. After the provider redirects back to the configured frontend integration page, re-fetch connection status.

A stored `CONNECTED` flag does not guarantee a provider token remains valid. If meeting execution returns an expired/revoked-token error, disconnect/reconnect and then Retry the failed proposal.

Meeting OAuth connections are separate from Google/Outlook email connections.

### 7.2 Verify a meeting created from a proposal

```http
GET /meetings/:meetingId
```

Relevant response fields:

```json
{
  "id": "MEETING_ID",
  "platform": "GOOGLE_MEET",
  "title": "Meeting with Tahid",
  "startsAt": "2026-09-24T09:00:00.000Z",
  "endsAt": "2026-09-24T09:30:00.000Z",
  "timezone": "Asia/Dhaka",
  "invitees": ["tahid@example.com"],
  "status": "SCHEDULED",
  "joinUrl": "https://meet.google.com/...",
  "botRequested": true
}
```

Meeting statuses:

```text
CREATING | READY | SCHEDULED | FAILED | CANCELLED
```

### 7.3 List meetings

```http
GET /meetings?page=1&limit=20&platform=GOOGLE_MEET&status=SCHEDULED
```

`platform` is `GOOGLE_MEET` or `ZOOM`.

### 7.4 Direct meeting creation

The chat proposal flow should normally use proposal approval. For an explicit non-AI create form:

```http
POST /meetings
Content-Type: application/json
```

```json
{
  "platform": "GOOGLE_MEET",
  "title": "Meeting with Tahid",
  "agenda": "Discuss the project quotation.",
  "startsAt": "2026-09-24T15:00:00+06:00",
  "durationMinutes": 30,
  "timezone": "Asia/Dhaka",
  "invitees": ["tahid@example.com"],
  "reminderMinutesBeforeStart": 15,
  "sendBot": true,
  "idempotencyKey": "a-new-stable-uuid"
}
```

Omit `startsAt` only for an intentional instant meeting.

Manage an existing scheduled meeting:

```text
PATCH  /meetings/:id
POST   /meetings/:id/bot
DELETE /meetings/:id
```

PATCH example (send only changed fields):

```json
{
  "title": "Updated meeting title",
  "startsAt": "2026-09-24T16:00:00+06:00",
  "durationMinutes": 45,
  "timezone": "Asia/Dhaka",
  "invitees": ["tahid@example.com"],
  "reminderMinutesBeforeStart": 15
}
```

Bot provision/retry body is optional:

```json
{
  "botName": "Noltra AI Notetaker"
}
```

## 8. Owner email connection and draft/send flow

### 8.1 Non-negotiable behavior

- Drafts live in this platform; they are not provider mailbox drafts.
- AI or frontend may prepare a draft, but only an explicit owner Send action calls the provider.
- Only `OWNER` can use these routes.
- Provider values are exactly `GOOGLE` and `OUTLOOK`.

### 8.2 List connections

```http
GET /email/connections
```

```json
[
  {
    "provider": "GOOGLE",
    "connected": true,
    "email": "owner@gmail.com",
    "expiresAt": "2026-09-23T12:00:00.000Z"
  },
  {
    "provider": "OUTLOOK",
    "connected": false
  }
]
```

### 8.3 Connect/disconnect email account

```text
GET    /email/connections/GOOGLE/connect
GET    /email/connections/OUTLOOK/connect
DELETE /email/connections/GOOGLE
DELETE /email/connections/OUTLOOK
```

Connect returns `{ "authorizationUrl": "..." }`. Open it in the browser, then re-fetch connections after the callback redirects to frontend.

### 8.4 Create a manual platform draft

```http
POST /email/drafts
Content-Type: application/json
```

```json
{
  "provider": "GOOGLE",
  "to": ["client@example.com"],
  "subject": "Project quotation",
  "body": "Hello,\n\nPlease review the quotation.\n\nRegards,",
  "clientDraftId": "b99d5b8a-ced2-4536-8446-2ae50a57b323"
}
```

Rules:

- `provider` is optional until Send;
- `to` requires `1..10` valid plain email addresses;
- subject length is `1..300`;
- body length is `1..20,000`;
- `clientDraftId` is an optional UUID and should be supplied by frontend.

Response:

```json
{
  "id": "DRAFT_ID",
  "provider": "GOOGLE",
  "to": ["client@example.com"],
  "subject": "Project quotation",
  "body": "Hello,\n\nPlease review the quotation.\n\nRegards,",
  "status": "DRAFT",
  "revision": 1,
  "createdAt": "2026-09-23T10:00:00.000Z",
  "updatedAt": "2026-09-23T10:00:00.000Z"
}
```

### 8.5 AI-created draft

When AI Backend supplies a valid structured email draft, the associated AI chat message includes:

```json
{
  "senderType": "AI",
  "content": "I prepared an email draft for your review.",
  "emailDraftId": "DRAFT_ID"
}
```

Frontend then calls:

```http
GET /email/drafts/DRAFT_ID
```

Plain assistant prose must not be parsed into an email draft. If `emailDraftId` is absent, do not show an executable Send button.

### 8.6 List/read/edit drafts

```text
GET   /email/drafts?page=1&limit=20
GET   /email/drafts/:id
PATCH /email/drafts/:id
```

PATCH body contains only changed fields:

```json
{
  "to": ["client@example.com"],
  "subject": "Updated project quotation",
  "body": "Updated email body.",
  "provider": "OUTLOOK"
}
```

Only `DRAFT` and `FAILED` drafts can be edited. Every successful edit increments `revision` and returns the new draft. Always replace local state with the server response.

### 8.7 Explicit Send

```http
POST /email/drafts/:id/send
Content-Type: application/json
```

```json
{
  "revision": 2,
  "provider": "GOOGLE"
}
```

`provider` may be omitted only when already stored on the draft. Send the latest server `revision`; stale revisions return `409`.

Success:

```json
{
  "id": "DRAFT_ID",
  "provider": "GOOGLE",
  "to": ["client@example.com"],
  "subject": "Updated project quotation",
  "body": "Updated email body.",
  "status": "SENT",
  "revision": 2,
  "sentFrom": "owner@gmail.com",
  "sentAt": "2026-09-23T10:15:00.000Z",
  "providerMessageId": "GMAIL_MESSAGE_ID"
}
```

Draft states:

| Status    | Frontend behavior                                                 |
| --------- | ----------------------------------------------------------------- |
| `DRAFT`   | Show editable preview and Send.                                   |
| `SENDING` | Disable edit/Send and show progress.                              |
| `SENT`    | Show sent confirmation; never Send again.                         |
| `FAILED`  | Show `lastError`; allow edit or explicit retry.                   |
| `UNKNOWN` | Warn user to check provider Sent Items; do not offer blind retry. |

`SENT` means the provider accepted the send request; it is not a recipient-delivery guarantee.

If the Send request returns an error after submission, immediately re-fetch `GET /email/drafts/:id`. The server may already have persisted `FAILED` or `UNKNOWN`, and the response error alone is not sufficient to choose a safe retry behavior.

## 9. Executive Briefings

### 9.1 Types and UI tabs

| UI tab                  | `:type`           |
| ----------------------- | ----------------- |
| Get today's briefing    | `TODAY`           |
| Discuss team challenges | `TEAM_CHALLENGES` |
| Weekly Review           | `WEEKLY_REVIEW`   |

### 9.2 Generate

```http
POST /chief-of-staff/briefings/TODAY/generate
Content-Type: application/json
```

Use `{}` for the current local period, or:

```json
{
  "asOf": "2026-09-23T10:00:00.000Z"
}
```

Immediate response:

```json
{
  "briefingId": "BRIEFING_ID",
  "status": "QUEUED",
  "pollAfterMs": 2000,
  "duplicate": false
}
```

Generation is limited to five requests per minute.

### 9.3 Poll by ID

```http
GET /chief-of-staff/briefings/id/:briefingId
```

Continue using the returned `pollAfterMs` while status is `QUEUED` or `GENERATING`. Stop on `READY` or `FAILED`.

READY response:

```json
{
  "id": "BRIEFING_ID",
  "briefingType": "TODAY",
  "period": {
    "start": "2026-09-22T18:00:00.000Z",
    "end": "2026-09-23T18:00:00.000Z",
    "timezone": "Asia/Dhaka"
  },
  "status": "READY",
  "attemptCount": 1,
  "content": {
    "summary": "Current grounded executive summary.",
    "trajectory": "POSITIVE",
    "confidence": 0.82,
    "headlineMetrics": [],
    "sections": [],
    "sourceRefs": []
  },
  "completedAt": "2026-09-23T10:00:05.000Z"
}
```

FAILED response contains:

```json
{
  "status": "FAILED",
  "failure": {
    "code": "AI_SERVICE_UNAVAILABLE",
    "message": "...",
    "retryable": true
  }
}
```

When `retryable` is true, a user-initiated generate request may be offered. Do not poll a terminal failed record indefinitely.

### 9.4 Read latest for a period

```text
GET /chief-of-staff/briefings/TODAY
GET /chief-of-staff/briefings/TEAM_CHALLENGES
GET /chief-of-staff/briefings/WEEKLY_REVIEW
GET /chief-of-staff/briefings/WEEKLY_REVIEW?asOf=2026-09-23T10:00:00.000Z
```

Use latest-read on screen revisit. If it returns `404`, show an empty state with Generate rather than treating it as a system failure.

### 9.5 Render the content contract

Headline metric:

```json
{
  "key": "ai_success_rate",
  "label": "AI success rate",
  "value": 98.7,
  "unit": "PERCENT",
  "direction": "UP",
  "severity": "INFO",
  "sourceRefs": ["FACT_ID"]
}
```

Section:

```json
{
  "id": "ceo_action_items",
  "title": "CEO Action Items",
  "kind": "DECISION_CARDS",
  "availability": "AVAILABLE",
  "summary": "Items requiring a decision.",
  "items": [
    {
      "id": "ITEM_ID",
      "label": "Approve meeting proposal",
      "detail": "Review the proposed meeting.",
      "status": "PENDING",
      "severity": "MEDIUM",
      "recommendationOnly": false,
      "proposalId": "PROPOSAL_MONGO_ID",
      "proposalAction": "APPROVE",
      "sourceRefs": ["FACT_ID"]
    }
  ]
}
```

Allowed presentation enums:

```text
availability: AVAILABLE | PARTIAL | UNAVAILABLE
kind:         TEXT | LIST | AGENT_CARDS | DECISION_CARDS | METRIC_GRID | PROGRESS | DONUT
trajectory:   POSITIVE | NEUTRAL | NEGATIVE | UNKNOWN
direction:    UP | DOWN | FLAT | UNKNOWN
severity:     INFO | LOW | MEDIUM | HIGH | CRITICAL
unit:         COUNT | PERCENT | CURRENCY_USD | MINUTES | HOURS | SCORE | TEXT
```

Rendering rules:

- use section `id` as the component key;
- preserve server section order;
- `UNAVAILABLE` means “data source unavailable”, never numeric zero;
- `PARTIAL` must be labelled as limited/partial evidence;
- only show an executable button when `recommendationOnly` is `false` and a real `proposalId`/`proposalAction` exist;
- execute a decision with the canonical proposal action route, then re-fetch the proposal; briefing content itself is a snapshot.

Stable section IDs:

```text
TODAY:
primary_focus, overnight_movements, ceo_action_items, pipeline_revenue,
client_health, operational_status, financial_pulse, vendor_accountability,
marketing_growth, design_status, ceo_notes

TEAM_CHALLENGES:
completed_milestones, ceo_action_items, next_day_decisions, key_risks,
strategic_blockers, financial_movements, operational_metrics,
vendor_performance, priority_alignment, team_accountability, escalations,
ceo_notes

WEEKLY_REVIEW:
executive_summary, roi_efficiency, sales_revenue, client_health,
delivery_milestones, marketing_growth, product_creative, ai_system_health,
financial_movements, vendor_performance, strategic_shift, ceo_notes
```

## 10. Agent catalog, runtime activity, and AI health

### 10.1 Agent catalog

```http
GET /agents?page=1&limit=50
```

Use this for agent name, image, type, and catalog `ACTIVE` status. Catalog `ACTIVE` means the agent profile is enabled; it does not prove uptime or recent execution.

### 10.2 Runtime activity

```http
GET /chief-of-staff/insights/agent-activity?limit=50
```

Optional range, maximum 90 days:

```http
GET /chief-of-staff/insights/agent-activity?from=2026-09-22T00:00:00.000Z&to=2026-09-24T00:00:00.000Z&limit=50
```

Response:

```json
{
  "range": {
    "from": "2026-09-22T00:00:00.000Z",
    "to": "2026-09-24T00:00:00.000Z"
  },
  "items": [
    {
      "id": "ACTIVITY_ID",
      "agentId": "AGENT_ID",
      "agentName": "Laura",
      "operationType": "SOURCE_ANALYSIS",
      "status": "SUCCEEDED",
      "latencyMs": 1400,
      "startedAt": "...",
      "completedAt": "..."
    }
  ]
}
```

### 10.3 AI runtime health

```http
GET /chief-of-staff/insights/ai-health
```

Optional `from` and `to` use the same rules as activity.

```json
{
  "from": "...",
  "to": "...",
  "totalRuns": 25,
  "completedRuns": 24,
  "succeeded": 23,
  "failed": 1,
  "running": 1,
  "skipped": 0,
  "successRatePercent": 95.83,
  "averageLatencyMs": 1320,
  "p95LatencyMs": 2400,
  "operationCounts": {
    "SOURCE_ANALYSIS": 20,
    "EXECUTIVE_BRIEFING": 5
  },
  "truncated": false
}
```

This is measured runtime reliability, not model accuracy or hallucination score. With no completed runs, percentage and latency fields can be `null`; do not render them as `0`.

## 11. CEO strategic notes

### 11.1 Create

```http
POST /chief-of-staff/strategic-notes
Content-Type: application/json
```

```json
{
  "title": "Enterprise focus",
  "kind": "STRATEGY",
  "content": "Focus on enterprise renewals and vendor accountability.",
  "appliesTo": ["TODAY", "WEEKLY_REVIEW"],
  "validFrom": "2026-09-23T00:00:00.000Z",
  "validUntil": "2026-10-01T00:00:00.000Z"
}
```

`kind`:

```text
NOTE | STRATEGIC_SHIFT | STRATEGY | PIVOT | BLOCKER
```

`appliesTo` defaults to all briefing types. `validFrom` defaults to now. `validUntil`, when supplied, must be after `validFrom`.

Response is the created note with normalized `id`.

### 11.2 List/update/delete

```text
GET    /chief-of-staff/strategic-notes?page=1&limit=20
GET    /chief-of-staff/strategic-notes?activeAt=2026-09-23T10:00:00.000Z
PATCH  /chief-of-staff/strategic-notes/:id
DELETE /chief-of-staff/strategic-notes/:id
```

PATCH contains only changed create fields. DELETE returns:

```json
{
  "id": "NOTE_ID",
  "deleted": true
}
```

Notes affect subsequently generated briefings; an already READY briefing is a snapshot and does not mutate automatically.

## 12. Integration cards and notifications

### 12.1 Integration cards

```http
GET /integrations
```

Use the returned `items[].connected`, `status`, `connectPath`, `account`, and `expiresAt` to render integration cards. Open the returned/canonical `connectPath` through Main Backend; do not construct provider OAuth URLs in frontend.

Representative response:

```json
{
  "organizationId": "ORG_ID",
  "items": [
    {
      "provider": "GMAIL",
      "label": "Gmail",
      "connected": true,
      "status": "CONNECTED",
      "isDefault": false,
      "connectPath": "/email/connections/GOOGLE/connect",
      "account": { "email": "owner@gmail.com" },
      "connectedByUserId": "USER_ID",
      "expiresAt": "2026-09-23T12:00:00.000Z"
    }
  ]
}
```

Email cards are owner-scoped. Meeting/calendar connection cards are organization-scoped.

### 12.2 Notification bell

```text
GET   /notifications/unread-count
GET   /notifications?status=ALL&page=1&limit=20
PATCH /notifications/:id/read
PATCH /notifications/:id/unread
PATCH /notifications/read-all
```

`status` is `ALL`, `UNREAD`, or `READ`; omit it to use `ALL`. Optional `type` is `AGENT_TASK_COMPLETED`, `MEETING_REMINDER`, `WEEKLY_ROI_REPORT`, or `PRODUCT_UPDATE`.

List response:

```json
{
  "items": [
    {
      "id": "NOTIFICATION_ID",
      "type": "MEETING_REMINDER",
      "title": "Meeting starts in about 1 hour",
      "message": "Meeting with Tahid starts at ...",
      "actionUrl": "/calendar",
      "readAt": null,
      "createdAt": "2026-09-23T10:00:00.000Z"
    }
  ],
  "total": 1,
  "unreadCount": 1,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

## 13. Data availability and CRM boundary

The following are implemented without CRM data:

- chat/conversation persistence;
- AI source processing and assistant reply persistence;
- task/meeting action proposals;
- clarification, approval, rejection, retry, and execution;
- task, meeting, calendar, proposal, and source-analysis facts;
- agent telemetry and runtime health;
- strategic notes;
- task-derived marketing/product-design partial facts;
- executive briefing generation with explicit availability;
- owner email connection, platform drafts, and explicit send.

These business domains do not yet have authoritative sources and must not be invented by frontend:

- customer/churn/NPS/renewal intelligence;
- CRM sales pipeline and revenue forecast;
- cash flow, burn rate, AR/AP, or general business finance;
- support ticket/SLA aggregation;
- vendor SLA/performance;
- agreed ROI calculations.

When a briefing section is `UNAVAILABLE`, show an unavailable/not-connected state. When `PARTIAL`, show the limited-data label. Never replace either state with mock values or zero.

## 14. End-to-end frontend sequences

### 14.1 Chat to approved meeting

```text
1. POST /messages/conversations                         (only for New Chat)
2. POST /messages                                       (save user message)
3. GET  /messages?conversationId=...                    (poll source status/reply)
4. GET  /call-intelligence/proposals?sourceType=USER_MESSAGE&sourceId=...
5. If NEEDS_CLARIFICATION:
   POST /call-intelligence/proposals/:id/clarifications (one answer)
   GET  /call-intelligence/proposals/:id                (poll refinement)
   repeat step 5 as required
6. When PENDING, render complete proposal preview
7. POST /call-intelligence/proposals/:id/action          ({"action":"APPROVE"})
8. Read target.id from EXECUTED response
9. GET  /meetings/:targetId                              (verify/render meeting)
```

### 14.2 Chat to AI email draft and owner Send

```text
1. POST /messages
2. GET  /messages?conversationId=...                    (poll)
3. Read AI message.emailDraftId
4. GET  /email/drafts/:emailDraftId
5. PATCH /email/drafts/:id                               (optional review edits)
6. Confirm selected provider is connected
7. POST /email/drafts/:id/send                           (latest revision)
8. Render SENT, FAILED, or UNKNOWN exactly as returned
```

### 14.3 Executive Briefing tab

```text
1. GET  /chief-of-staff/briefings/:type                  (load existing)
2. If 404 or user requests refresh:
   POST /chief-of-staff/briefings/:type/generate
3. GET  /chief-of-staff/briefings/id/:briefingId         (poll using pollAfterMs)
4. READY: render content by stable section id
5. FAILED: stop polling and use failure.retryable
6. Executable decision card: use proposal /action route, then re-fetch proposal
```

## 15. Frontend acceptance checklist

- [ ] API requests go only to Main Backend.
- [ ] A new logical message/draft gets one client UUID; request retries reuse it.
- [ ] Conversation title creation is not treated as a user AI message.
- [ ] Message polling stops on `COMPLETED`, `FAILED`, or `NOT_REQUESTED`.
- [ ] Proposals are queried with user message ID, not conversation ID.
- [ ] Clarification answers use only `/call-intelligence/proposals/:id/clarifications`.
- [ ] Only one clarification is submitted while proposal state is stable.
- [ ] `/action` sends only `APPROVE`, `REJECT` with reason, or `RETRY`.
- [ ] `APPROVED` is not shown as successful execution; `EXECUTED` plus target is.
- [ ] Provider connection errors lead to reconnect, then proposal Retry.
- [ ] Email Send always follows visible draft review and uses latest revision.
- [ ] `UNKNOWN` email sends are never blindly retried.
- [ ] Briefing polling uses `pollAfterMs` and stops on terminal states.
- [ ] `UNAVAILABLE` and `PARTIAL` are rendered honestly without fabricated numbers.
- [ ] Runtime success rate is labelled reliability/health, not AI accuracy.
- [ ] Role-restricted controls are hidden/disabled and backend errors remain handled.
