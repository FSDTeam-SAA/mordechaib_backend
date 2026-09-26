# Frontend API Guideline

Version: 2.1
Last reviewed against Main Backend: 2026-09-25

## 1. Purpose and scope

This is the canonical frontend implementation contract for every completed product-facing Main Backend feature. A frontend developer should be able to implement the current application without reading Main Backend code:

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
- notification bell and integration cards;
- support request submission, recent-request list, details, private attachments, and deletion.
- authentication, profile, organization, team, settings, task, approval, call, calendar, billing, onboarding, integration, and platform-admin flows.

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
| Submit/read/delete own support requests    | `OWNER`, `ADMIN`, `MEMBER` |
| Manage support request lifecycle           | platform admin only        |
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

| UI purpose                   | Method and path                                                       |
| ---------------------------- | --------------------------------------------------------------------- |
| Login                        | `POST /auth/login`                                                    |
| Current profile              | `GET /auth/me`                                                        |
| List recent chats            | `GET /messages/conversations`                                         |
| Create New Chat              | `POST /messages/conversations`                                        |
| Latest chat                  | `GET /messages/conversation`                                          |
| Send user message            | `POST /messages`                                                      |
| Read chat messages           | `GET /messages`                                                       |
| Get one message              | `GET /messages/:messageId`                                            |
| Attachment download          | `GET /messages/:messageId/attachments/:attachmentId/download`         |
| Delete own message           | `DELETE /messages/:messageId`                                         |
| List proposals               | `GET /call-intelligence/proposals`                                    |
| Get one proposal             | `GET /call-intelligence/proposals/:id`                                |
| Answer clarification         | `POST /call-intelligence/proposals/:id/clarifications`                |
| Approve/reject/retry         | `POST /call-intelligence/proposals/:id/action`                        |
| List meetings                | `GET /meetings`                                                       |
| Get created meeting          | `GET /meetings/:id`                                                   |
| Meeting provider connections | provider routes in section 7                                          |
| Calendar dashboard           | `GET /calendar/dashboard`                                             |
| Synchronize calendars        | `POST /calendar/sync`                                                 |
| Calendar event CRUD          | `/calendar/events` routes in section 19.6                             |
| List email connections       | `GET /email/connections`                                              |
| Connect email provider       | `GET /email/connections/:provider/connect`                            |
| Create/list/read/edit draft  | `/email/drafts` routes in section 8                                   |
| Explicitly send draft        | `POST /email/drafts/:id/send`                                         |
| Generate briefing            | `POST /chief-of-staff/briefings/:type/generate`                       |
| Poll/read briefing           | `GET /chief-of-staff/briefings/id/:briefingId`                        |
| Latest briefing for period   | `GET /chief-of-staff/briefings/:type`                                 |
| Strategic notes              | `/chief-of-staff/strategic-notes` routes                              |
| Runtime agent activity       | `GET /chief-of-staff/insights/agent-activity`                         |
| AI runtime health            | `GET /chief-of-staff/insights/ai-health`                              |
| Agent catalog                | `GET /agents`                                                         |
| Integration cards            | `GET /integrations`                                                   |
| Notification bell count      | `GET /notifications/unread-count`                                     |
| Task dashboard analytics     | `GET /organizer-dashboard/task-overview`                              |
| List/filter tasks            | `GET /tasks`                                                          |
| Create a task                | `POST /tasks`                                                         |
| Read/edit/delete a task      | `/tasks/:id` routes in section 19                                     |
| Task-page upcoming meetings  | `GET /organizer-dashboard/upcoming-meetings`                          |
| Submit support request       | `POST /support/requests`                                              |
| Recent support requests      | `GET /support/requests`                                               |
| Support request details      | `GET /support/requests/:requestId`                                    |
| Support attachment           | `GET /support/requests/:requestId/attachments/:attachmentId/download` |
| Delete support request       | `DELETE /support/requests/:requestId`                                 |

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
CREATING | READY | SCHEDULED | COMPLETED | FAILED | CANCELLED
```

Every platform-created meeting requests a meeting bot in the current product
flow. The Main Backend changes the platform meeting to `COMPLETED` when the bot
reports that the call ended/done, or when its transcript completes. The
frontend must render the returned status and must not derive completion only
from the current clock.

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

### 7.5 Manual meeting-bot fallback

**Collection/resource: `meeting_bots`** — a Recall bot attached to an already-existing Zoom or Google Meet URL. This is an advanced fallback for a meeting that was created outside the connected organizer account. For a new calendar meeting, use `POST /meetings` instead.

```http
POST /meeting-bots
Content-Type: application/json
```

```json
{
  "platform": "GOOGLE_MEET",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "joinAt": "2026-09-24T09:00:00.000Z",
  "botName": "Noltra AI Notetaker",
  "idempotencyKey": "a-new-stable-uuid",
  "metadata": {
    "source": "manual-support-flow"
  }
}
```

`platform` and `meetingUrl` are required. `joinAt`, `botName`, `idempotencyKey`, and `metadata` are optional. The URL must match the declared platform. Reuse an idempotency key only to retry the same request.

Successful create, read, and update calls return a meeting-bot resource in `data`, for example:

```json
{
  "id": "meeting-bot-id",
  "platform": "GOOGLE_MEET",
  "status": "SCHEDULED",
  "joinAt": "2026-09-24T09:00:00.000Z",
  "botName": "Noltra AI Notetaker",
  "recallBotId": "provider-bot-id",
  "createdAt": "2026-09-23T10:00:00.000Z"
}
```

```text
GET    /meeting-bots?page=1&limit=20&status=SCHEDULED&platform=GOOGLE_MEET
GET    /meeting-bots/:id
GET    /meeting-bots/:id/transcript
GET    /meeting-bots/:id/audio
PATCH  /meeting-bots/:id
DELETE /meeting-bots/:id
POST   /meeting-bots/:id/leave
```

List filters are optional; `page` defaults to `1` and `limit` to `20` (maximum `100`). Valid statuses include `PENDING`, `SCHEDULED`, `JOINING`, `IN_CALL`, `PROCESSING`, `COMPLETED`, `FAILED`, and `CANCELLED`. The update body may contain only `meetingUrl`, `joinAt`, and/or `botName`:

```json
{
  "joinAt": "2026-09-24T10:00:00.000Z",
  "botName": "Noltra AI Notetaker"
}
```

`GET /:id/audio` returns a temporary download URL in the normal envelope. `POST /:id/leave` returns `{ "leaving": true, "recallBotId": "..." }`. A cancelled bot must not be treated as a completed transcript.

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

Platform-agent administration uses the same `agents` collection but requires `isPlatformAdmin: true`:

| Endpoint             | Request body / query                               | Response data                                                    |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /agents`       | `{ "name", "imageUrl"?: "https://...", "type" }`   | created agent profile                                            |
| `GET /agents`        | `page`, `limit`, `search`, `type`, `status`        | paginated catalog; non-platform users are restricted to `ACTIVE` |
| `GET /agents/:id`    | none                                               | one agent profile                                                |
| `PATCH /agents/:id`  | any subset of `name`, `imageUrl`, `type`, `status` | updated agent profile                                            |
| `DELETE /agents/:id` | none                                               | disabled agent profile/result                                    |

For organization screens, use only the read list; never try to infer runtime health from catalog status. Use section 10.2 telemetry instead.

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

Platform admin can publish a product update through:

```http
POST /notifications/admin/product-updates
```

```json
{
  "title": "New email workflow",
  "message": "Google and Outlook draft/send is now available.",
  "actionUrl": "/dashboard/integrations"
}
```

The response is the created publication/notification result. This route requires `isPlatformAdmin: true` and must not be shown to organization users.

## 13. Help & Support

### 13.1 Screen lifecycle

Use this sequence for the Help & Support screen:

```text
1. GET    /support/requests?page=1&limit=20                (initial/recent list)
2. POST   /support/requests                                (submit multipart form)
3. GET    /support/requests?page=1&limit=20                (refresh after submit)
4. GET    /support/requests/:requestId                     (Details modal)
5. GET    /support/requests/:requestId/attachments/:attachmentId/download
6. DELETE /support/requests/:requestId                     (only after confirmation)
```

All user-facing routes are organization- and requester-scoped. Even an organization owner or admin sees only requests created by their own user account on this screen. A `404` can mean the request is missing, deleted, or inaccessible; do not reveal which case applies.

### 13.2 Categories and statuses

Allowed categories:

```text
ACCOUNT | BILLING | TECHNICAL | INTEGRATION | AI_ASSISTANT |
FEATURE_REQUEST | OTHER
```

Lifecycle statuses and suggested labels:

| API value     | UI label    |
| ------------- | ----------- |
| `OPEN`        | Open        |
| `IN_PROGRESS` | In progress |
| `RESOLVED`    | Resolved    |
| `CLOSED`      | Closed      |

The user frontend displays the returned status but does not update it. Status updates are performed through the platform-support routes in section 13.8.

### 13.3 Submit a support request

```http
POST /support/requests
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>
```

Form fields:

| Field         | Required | Contract                                                         |
| ------------- | -------- | ---------------------------------------------------------------- |
| `category`    | yes      | one category enum value                                          |
| `subject`     | yes      | trimmed string, 3–200 characters                                 |
| `description` | yes      | plain text, 10–20,000 characters                                 |
| `attachments` | no       | repeated file field; maximum 5; PDF/JPG/JPEG/PNG; 10 MB per file |

Browser example:

```ts
const form = new FormData();
form.append('category', 'TECHNICAL');
form.append('subject', 'Dashboard report is not loading');
form.append(
  'description',
  'The report stays blank after selecting a date range.',
);
files.forEach((file) => form.append('attachments', file));

await api.post('/support/requests', form);
```

When using `FormData`, do not manually set the multipart boundary. Do not append an empty string for `attachments`; append only real `File` objects.

Response data:

```json
{
  "id": "66f2d80f6b62081a43c82411",
  "ticketId": "SUP-20260923-A1B2C3D4",
  "organizationId": "66f2d70f6b62081a43c82300",
  "createdByUserId": "66f2d72f6b62081a43c82310",
  "category": "TECHNICAL",
  "subject": "Dashboard report is not loading",
  "description": "The report stays blank after selecting a date range.",
  "status": "OPEN",
  "attachmentCount": 1,
  "attachments": [
    {
      "id": "66f2d82f6b62081a43c82420",
      "originalName": "error.png",
      "mimeType": "image/png",
      "sizeBytes": 152340,
      "createdAt": "2026-09-23T10:00:00.000Z"
    }
  ],
  "createdAt": "2026-09-23T10:00:00.000Z",
  "updatedAt": "2026-09-23T10:00:00.000Z"
}
```

Disable Submit while this request is in flight. The endpoint does not accept a frontend idempotency key, so an ambiguous retry must first refresh the recent list and check whether the ticket was created.

### 13.4 Recent support requests

```http
GET /support/requests?page=1&limit=20&status=OPEN&category=TECHNICAL
```

`status` and `category` are optional. `page` defaults to `1`; `limit` defaults to `20` and has a maximum of `100`.

Response data:

```json
{
  "items": [
    {
      "id": "66f2d80f6b62081a43c82411",
      "ticketId": "SUP-20260923-A1B2C3D4",
      "organizationId": "66f2d70f6b62081a43c82300",
      "createdByUserId": "66f2d72f6b62081a43c82310",
      "category": "TECHNICAL",
      "subject": "Dashboard report is not loading",
      "status": "OPEN",
      "attachmentCount": 1,
      "createdAt": "2026-09-23T10:00:00.000Z",
      "updatedAt": "2026-09-23T10:03:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Use `updatedAt` for the table's Updated column and format it as relative time in the user's locale. Use `id`, not `ticketId`, in endpoint paths; `ticketId` is the human-readable display value.

### 13.5 Details modal

```http
GET /support/requests/:requestId
```

The response has the same detailed shape as the create response. It contains full `description` and active attachment metadata. Provider storage keys are never returned.

Render `description` as text. Do not use `dangerouslySetInnerHTML` with this value.

### 13.6 View or download a private attachment

```http
GET /support/requests/:requestId/attachments/:attachmentId/download?disposition=inline
```

`disposition` is optional and accepts:

- `inline` for the View File action; this is the default;
- `attachment` for a download action.

Response data:

```json
{
  "attachmentId": "66f2d82f6b62081a43c82420",
  "originalName": "error.png",
  "mimeType": "image/png",
  "downloadUrl": "https://provider.example/private-signed-url",
  "expiresAt": "2026-09-23T10:08:00.000Z"
}
```

Request this endpoint only when the user clicks View/Download, then open the URL immediately. The signed URL is short-lived: do not save it in persistent state, local storage, or the database.

### 13.7 Delete confirmation

After the user confirms the modal:

```http
DELETE /support/requests/:requestId
```

There is no request body.

```json
{
  "requestId": "66f2d80f6b62081a43c82411",
  "deleted": true,
  "cleanupComplete": true
}
```

On success, close the modal and remove the row locally or re-fetch the first page. `cleanupComplete: false` still means the request is deleted from the user view; it indicates that private-file cleanup needs backend operational follow-up.

### 13.8 Platform-support management

These routes require `isPlatformAdmin: true`. Organization `OWNER` or `ADMIN` alone is not sufficient.

```text
GET   /support/admin/requests
GET   /support/admin/requests/:requestId
GET   /support/admin/requests/:requestId/attachments/:attachmentId/download
PATCH /support/admin/requests/:requestId/status
```

Admin-list query parameters:

```text
page, limit, status, category, organizationId, createdByUserId, search
```

Status update body:

```json
{
  "status": "RESOLVED",
  "resolutionNote": "Configuration corrected and verified with the customer."
}
```

`resolutionNote` is optional and has a maximum length of 2,000 characters. Replace local ticket state with the returned server record after a successful update.

### 13.9 Support error handling

- File extension, MIME type, and file signature are checked; surface the backend validation `message` when upload fails.
- On `413` or a file-size validation failure, retain text fields and ask the user to remove/replace oversized files.
- On `429`, keep the completed form and allow retry after the rate-limit period.
- On details/download/delete `404`, close stale modals and refresh the list.
- Never expose another user's support data based on guessed IDs.

## 14. Data availability and CRM boundary

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
- support ticket/SLA aggregation in executive briefings (the Help & Support
  request module is operational ticket intake, but it is not yet an
  authoritative SLA/analytics source for AI briefings);
- vendor SLA/performance;
- agreed ROI calculations.

When a briefing section is `UNAVAILABLE`, show an unavailable/not-connected state. When `PARTIAL`, show the limited-data label. Never replace either state with mock values or zero.

## 15. End-to-end frontend sequences

### 15.1 Chat to approved meeting

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

### 15.2 Chat to AI email draft and owner Send

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

### 15.3 Executive Briefing tab

```text
1. GET  /chief-of-staff/briefings/:type                  (load existing)
2. If 404 or user requests refresh:
   POST /chief-of-staff/briefings/:type/generate
3. GET  /chief-of-staff/briefings/id/:briefingId         (poll using pollAfterMs)
4. READY: render content by stable section id
5. FAILED: stop polling and use failure.retryable
6. Executable decision card: use proposal /action route, then re-fetch proposal
```

### 15.4 Help & Support screen

```text
1. GET    /support/requests?page=1&limit=20
2. POST   /support/requests with FormData
3. Refresh list and render returned status
4. GET    /support/requests/:requestId for Details
5. GET    attachment download URL only on View File click
6. DELETE /support/requests/:requestId only after confirmation
7. Remove/refetch row after successful deletion
```

## 16. Frontend acceptance checklist

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
- [ ] Support submission uses `FormData` and the repeated field name `attachments`.
- [ ] Support details/download/delete paths use Mongo `id`, not display `ticketId`.
- [ ] Support descriptions are rendered as text, not injected HTML.
- [ ] Private attachment URLs are requested on demand and never persisted.
- [ ] Delete is called only after explicit confirmation.
- [ ] User support UI never calls `/support/admin/...` routes.

## 17. Complete Backend Collection and Resource Index

This index is the resource-first map for the completed backend. A **collection** is the MongoDB collection that stores the authoritative record. A few endpoints are computed views or provider proxies and therefore have no new collection of their own. All paths are relative to `/api/v1`.

| Collection / resource                                            | What it stores                                                   | Canonical frontend endpoints                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `users`                                                          | User profile, role, preferences, verification state              | `/auth/*`, `/users`, `/team`                                                    |
| `auth_sessions`, `auth_tokens`                                   | Refresh sessions and reset/verification codes                    | `/auth/login`, `/auth/refresh`, password and verification routes                |
| `organizations`                                                  | Company profile, onboarding and organization settings            | `/organizations/me`                                                             |
| `notification_preferences`                                       | Per-user notification settings                                   | `/settings/notifications`                                                       |
| `ai_settings`                                                    | Organization AI configuration                                    | `/settings/ai`                                                                  |
| `tasks`                                                          | Organization tasks, subtasks, dependencies and task links        | `/tasks`                                                                        |
| `approvals`                                                      | Generic organization approval queue                              | `/approvals`                                                                    |
| `call_logs`, `call_recordings`                                   | Outbound call records and recording references                   | `/calls`                                                                        |
| `integrations`, `integration_oauth_states`, `crm_deals`          | CRM connections, one-time OAuth state, and normalized deal cache | `/integrations`, `/crm/connections/*`, `/crm/analytics/revenue`, `/crm/*/deals` |
| `managed_calendar_events`                                        | Platform-managed calendar events                                 | `/calendar/events`                                                              |
| `platform_meetings`                                              | Provider-created Google Meet/Zoom meetings                       | `/meetings`                                                                     |
| `meeting_bots`, `meeting_transcripts`                            | Recall bot jobs, transcript and temporary audio access           | `/meeting-bots`                                                                 |
| `recall_zoom_connections`, `meeting_oauth_states`                | Organization calendar/provider connections and OAuth state       | connection routes in section 7 and `/calendar/connections`                      |
| `conversations`, `messages`, `message_attachments`               | AI chat threads, messages and private attachments                | `/messages/*`                                                                   |
| `ai_action_proposals`, `ai_source_analyses`                      | AI action proposals and source analysis                          | `/call-intelligence/proposals/*`                                                |
| `agents`, `agent_activities`                                     | Agent catalog and runtime telemetry                              | `/agents`, Chief of Staff insight routes                                        |
| `executive_briefings`, `strategic_notes`                         | Generated briefings and CEO direction                            | `/chief-of-staff/*`                                                             |
| `email_connections`, `email_drafts`, `email_oauth_states`        | Owner mail connections, drafts and send audit state              | `/email/*`                                                                      |
| `support_requests`                                               | User-submitted Help & Support tickets and private attachments    | `/support/requests/*`                                                           |
| `subscription_plans`, `organization_subscriptions`               | Plan catalog and organization subscription state                 | `/subscription-plans`, `/subscriptions`, `/billing`                             |
| `addon_products`                                                 | Public/commercial add-on catalog                                 | `/addon-products`, `/billing/addons`                                            |
| `invoices`, `revenue_snapshots`                                  | Stripe invoice cache and platform revenue summaries              | `/invoices`, `/subscription-analytics`                                          |
| `cancellation_requests`                                          | Subscription cancellation workflow                               | `/subscriptions/me/cancel`, `/subscriptions-admin/cancellation-requests`        |
| `usage_records`, `call_usage_periods`                            | Product and Twilio metered usage                                 | `/usage`, `/twilio/usage`                                                       |
| `setup_packages`, `onboarding_setups`, `onboarding_availability` | Paid setup catalog, customer onboarding and booking availability | `/setup-packages`, `/onboarding-setups`                                         |
| `twilio_accounts`, `twilio_phone_numbers`, `twilio_settings`     | Managed Twilio connection, number and call configuration         | `/twilio/*`                                                                     |
| `audit_logs`                                                     | Security and business audit events                               | `/audit-logs`                                                                   |
| `package_inquiries`                                              | Public sales/package leads                                       | `/package-inquiries`                                                            |
| computed resources                                               | Health, organizer dashboard, pricing estimate and provider data  | `/health`, `/organizer-dashboard/*`, `/subscription-plans/estimate`, `/meta/*`  |

### 17.1 Universal response shapes

All normal JSON responses use the envelope already described in section 2:

```json
{ "success": true, "data": {} }
```

The examples in this document show only `data`. Collection records generally include `id` or Mongo `_id`, `createdAt`, and `updatedAt`. Do not assume every collection normalizes `_id` to `id`; use the exact field documented by that feature.

Pagination uses one of these two established shapes:

```json
{
  "items": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
}
```

or, in older platform-admin resources:

```json
{ "items": [], "total": 0, "page": 1, "limit": 20, "pages": 0 }
```

For mutation endpoints, replace optimistic state with the server response. A `204` or an explicit `{ "deleted": true }` response means the UI should remove the resource.

### 17.2 Route classification

- **Public**: no bearer token.
- **Authenticated**: valid bearer token; organization is taken from the token.
- **Org owner/admin/member**: organization role enforced by backend.
- **Platform admin**: requires `isPlatformAdmin: true`; an organization `ADMIN` is not enough.
- **Provider callback/webhook/legacy**: not a normal frontend API. Do not call it from application UI unless the section explicitly says to open the returned OAuth authorization URL.

## 18. Identity, Profile, Organization, Team, and Settings

### 18.1 `users`, `auth_sessions`, and `auth_tokens` — authentication

These collections hold account identity and secure session/token state. Passwords,
stored token hashes, and emailed verification codes are never returned. A
short-lived reset token is returned only after successful password-OTP
verification.

| Endpoint                         | Access        | Request body                                                               | Response data                                                   |
| -------------------------------- | ------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `POST /auth/register`            | Public        | `{ firstName, lastName, email, password, acceptTerms: true, rememberMe? }` | authenticated session/token payload plus user/organization data |
| `POST /auth/login`               | Public        | `{ email, password, rememberMe?: false }`                                  | `{ accessToken, refreshToken, user }`                           |
| `POST /auth/refresh`             | Public        | `{ refreshToken }`                                                         | replacement session/token payload                               |
| `POST /auth/logout`              | Authenticated | none                                                                       | logout confirmation                                             |
| `POST /auth/logout-all`          | Authenticated | none                                                                       | all current-user sessions revoked                               |
| `POST /auth/forgot-password`     | Public        | `{ email }`                                                                | generic accepted response; do not reveal account existence      |
| `POST /auth/verify-reset-otp`    | Public        | `{ email, code }`                                                          | short-lived reset token                                         |
| `POST /auth/reset-password`      | Public        | `{ newPassword }` plus `x-password-reset-token` header                     | success confirmation                                            |
| `PATCH /auth/change-password`    | Authenticated | `{ currentPassword, newPassword }`                                         | updated session/security response                               |
| `POST /auth/verify-email`        | Public        | `{ email, code }`                                                          | verified user/session response                                  |
| `POST /auth/resend-verification` | Public        | `{ email }`                                                                | generic accepted response                                       |
| `DELETE /auth/me`                | Authenticated | `{ password, confirmation: "DELETE" }`                                     | account deletion confirmation                                   |

Password rule for register, reset, and change: 8–72 characters and at least one uppercase, lowercase, number, and special character.

Password reset flow: call `POST /auth/forgot-password`, verify the email OTP
with `POST /auth/verify-reset-otp`, then retain the returned `resetToken` only
until the password form is submitted. Call `POST /auth/reset-password` with
that value in `x-password-reset-token`; the reset form body contains only
`newPassword`. The reset token expires after 15 minutes by default.

Successful login example:

```json
{
  "accessToken": "JWT_ACCESS_TOKEN",
  "refreshToken": "REFRESH_TOKEN",
  "user": {
    "id": "USER_ID",
    "organizationId": "ORG_ID",
    "email": "owner@example.com",
    "firstName": "Rifat",
    "lastName": "Hossain",
    "role": "OWNER"
  }
}
```

### 18.2 `users` — current profile and organization user list

| Endpoint         | Access        | Request body / query                                                                    | Response data                                      |
| ---------------- | ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `GET /auth/me`   | Authenticated | none                                                                                    | current user profile, organization and preferences |
| `PATCH /auth/me` | Authenticated | multipart form: required `expectedUpdatedAt`; optional profile fields and `avatar` file | updated profile                                    |
| `GET /users`     | Authenticated | none                                                                                    | users visible in the current organization          |

`PATCH /auth/me` fields are `firstName`, `lastName`, `phoneNumber`, `timezone`, `language`, `avatarUrl`, and optional binary `avatar`. The avatar must be JPEG, PNG, or WebP and no more than 5 MB. Send `expectedUpdatedAt` from the most recent `GET /auth/me`; a stale value must be re-fetched rather than overwritten.

### 18.3 `organizations` — company profile

| Endpoint                                          | Access                                | Request body                                     | Response data                 |
| ------------------------------------------------- | ------------------------------------- | ------------------------------------------------ | ----------------------------- |
| `GET /organizations/me`                           | Authenticated                         | none                                             | current organization document |
| `GET /organizations/:organizationId`              | Authenticated, same organization only | path must equal token organization ID            | current organization document |
| `PATCH /organizations/me`                         | Org `OWNER` or `ADMIN`                | multipart form with optional settings and `logo` | updated organization          |
| `PATCH /organizations/onboarding/:organizationId` | Org `OWNER` or `ADMIN`                | same onboarding/settings body without file       | updated organization          |

Organization update fields: `companyName`, `website`, `phoneNumber`, `emailAddress`, `timezone`, `language`, `businessHoursStart`, `businessHoursEnd`, `city`, `street`, `state`, `postalCode`, `industry`, `businessSize`, and optional JPEG/PNG/WebP `logo` up to 5 MB. The backend manages `updatedAt`; do not send it from the frontend.

Representative response:

```json
{
  "id": "ORG_ID",
  "companyName": "Noltra AI",
  "timezone": "Asia/Dhaka",
  "industry": "TECHNOLOGY",
  "logoUrl": "https://...",
  "updatedAt": "2026-09-24T10:00:00.000Z"
}
```

### 18.4 `team_members` — platform team administration

This is a platform-admin feature, not an organization member-management screen.

| Endpoint                       | Request body / query    | Response data                |
| ------------------------------ | ----------------------- | ---------------------------- |
| `POST /team`                   | `CreateTeamMemberDto`   | invited team member          |
| `GET /team`                    | pagination/filter query | team member list             |
| `GET /team/:id`                | none                    | one team member              |
| `PATCH /team/:id`              | `UpdateTeamMemberDto`   | updated team member          |
| `POST /team/:id/resend-invite` | none                    | invite dispatch confirmation |
| `DELETE /team/:id`             | none                    | removal confirmation         |

All `/team` routes require platform admin. Create body:

```json
{
  "name": "Support Manager",
  "email": "support.manager@example.com",
  "permissions": ["Help & Support"],
  "role": "SUB_ADMIN"
}
```

Update body accepts only `permissions`, `status`, and `role`. List query accepts `page`, `limit`, `search`, `status`, and `role`. The response is the persisted team-member record with name, email, role, permissions, status, invite state, and timestamps. Do not expose this UI to organization users.

### 18.5 `notification_preferences` and `ai_settings` — settings

| Endpoint                        | Access                 | Request body                        | Response data                           |
| ------------------------------- | ---------------------- | ----------------------------------- | --------------------------------------- |
| `GET /settings/notifications`   | Authenticated          | none                                | current user's notification preferences |
| `PATCH /settings/notifications` | Authenticated          | notification preference fields only | saved preferences                       |
| `GET /settings/ai`              | Authenticated          | none                                | organization AI settings                |
| `PATCH /settings/ai`            | Org `OWNER` or `ADMIN` | AI setting fields only              | saved AI settings                       |

Notification update body accepts any subset of:

```json
{
  "emailNotifications": true,
  "inAppNotifications": true,
  "agentTaskCompletions": true,
  "meetingReminders": true,
  "weeklyRoiReports": false,
  "productUpdates": true
}
```

AI settings update body accepts any subset of:

```json
{
  "autoApproveLowRiskActions": false,
  "learningMode": false,
  "agentActivityNotifications": true,
  "responseStyle": "CONCISE"
}
```

Do not send unknown settings fields: global validation rejects non-whitelisted body fields. Keep the backend response as the source of truth after a save.

## 19. Operations: Tasks, Approvals, Calls, CRM Foundation, and Calendar

### 19.1 `tasks` — task management

`tasks` is the authoritative operational task collection. All task routes are organization-scoped; create/update/delete allow `OWNER`, `ADMIN`, and `MEMBER`.

| Endpoint            | Request body / query                                                                                                   | Response data         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `POST /tasks`       | task body below                                                                                                        | created task          |
| `GET /tasks`        | `page`, `limit`, `search`, `status` or `statusGroup`, `priority`, `department`, `assignedToUserId`, `dueFrom`, `dueTo` | paginated tasks       |
| `GET /tasks/:id`    | none                                                                                                                   | one task              |
| `PATCH /tasks/:id`  | any subset of create body                                                                                              | updated task          |
| `DELETE /tasks/:id` | none                                                                                                                   | deletion confirmation |

Create example:

```json
{
  "title": "Prepare Q3 pricing sheet",
  "description": "Validate supplier pricing and margin calculations.",
  "assignedToUserId": "USER_ID",
  "department": "FINANCE",
  "priority": "HIGH",
  "status": "TODO",
  "dueDate": "2026-10-01T00:00:00.000Z",
  "estimatedDurationMinutes": 60,
  "stakeholderIds": ["USER_ID"],
  "dependencies": [{ "title": "Finance figures ready", "isComplete": false }],
  "attachments": [
    {
      "name": "pricing.pdf",
      "url": "https://files.example/pricing.pdf",
      "kind": "FILE"
    }
  ],
  "requiredAttachments": [{ "name": "Approved pricing", "isComplete": false }],
  "aiAssistance": { "generateChecklist": true, "suggestNextSteps": true },
  "reminder": { "enabled": true, "minutesBeforeDue": 60 },
  "subtasks": [{ "title": "Check margin", "isComplete": false }],
  "tags": ["#Finance"]
}
```

Task status values are `DRAFT`, `TODO`, `IN_PROGRESS`, `WAITING`, `BLOCKED`, and `COMPLETED`. Department values are `SALES`, `FINANCE`, `OPERATIONS`, `STRATEGY`, `SUPPORT`, `DESIGN`, `MARKETING`, and `OTHER`.

For the dashboard tabs, use one `statusGroup` value instead of combining multiple status requests:

- `PENDING`: non-overdue `DRAFT`, `TODO`, `WAITING`, and `BLOCKED` tasks.
- `IN_PROGRESS`: non-overdue `IN_PROGRESS` tasks.
- `COMPLETED`: completed tasks.
- `OVERDUE`: every non-completed task whose due date has passed.

`status` and `statusGroup` are mutually exclusive. `dueFrom` and `dueTo` filter the task due date; both endpoints are inclusive. Every returned task includes a derived `isOverdue` boolean. The response intentionally omits `organizationId`, but includes creator/assignee IDs, title, status, priority, department, dates, nested task fields, AI proposal/agent metadata when applicable, and timestamps.

When a task first becomes `COMPLETED`, the backend sets `completedAt`. Reopening the task clears `completedAt`, so completion analytics do not retain a stale timestamp.

For an AI-created task whose payload omits `department`, Main Backend derives the department when `proposedByAgent.type` exactly matches a task department (including `STRATEGY`). An explicit AI payload department is preserved. The current AI Backend contract does not yet list `STRATEGY` as an explicit task-department value, so it should omit that field for a Strategy Agent task until its own whitelist is updated.

### 19.2 `approvals` — generic approval queue

| Endpoint                       | Request body                                                 | Response data                 |
| ------------------------------ | ------------------------------------------------------------ | ----------------------------- |
| `POST /approvals`              | `{ "actionType": "...", "provider"?: "...", "payload": {} }` | created approval              |
| `GET /approvals`               | none                                                         | organization approval records |
| `PATCH /approvals/:id/approve` | none                                                         | approved record               |
| `PATCH /approvals/:id/reject`  | none                                                         | rejected record               |

`payload` is an object whose shape is defined by `actionType`. This generic queue is separate from AI proposal approval in section 6; do not mix their IDs or routes.

### 19.3 `call_logs` and `call_recordings` — outbound calls

| Endpoint               | Request body / query                                                          | Response data                                |
| ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /calls/outbound` | `{ "clientPhone": "+880...", "agentPhone"?: "+880...", "contactId"?: "..." }` | created outbound-call record/provider result |
| `GET /calls`           | none                                                                          | organization call log list                   |

Phone numbers must be E.164. `agentPhone` defaults to the organization forwarding number when omitted. This endpoint does not fabricate CRM contacts; `contactId` is optional.

### 19.4 `integrations` and `crm_deals` — HubSpot/Salesforce CRM

CRM connections belong to the organization, not an individual user. The first connected CRM becomes the organization default. If both providers are connected, the frontend can change that default. Normal contact creation uses the default; deal routes always state their provider explicitly.

| Endpoint                                   | Request body / query                                                     | Response data                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `GET /integrations`                        | none                                                                     | CRM card status, `isDefaultCrm`, `lastSyncedAt`, `syncStatus`, `lastSyncError`, and `reconnectRequired` |
| `GET /crm/connections/HUBSPOT/connect`     | none                                                                     | `{ "authorizationUrl": "https://..." }`                                                                 |
| `GET /crm/connections/SALESFORCE/connect`  | none                                                                     | `{ "authorizationUrl": "https://..." }`                                                                 |
| `GET /crm/connections/:provider/callback`  | OAuth provider redirect                                                  | Redirects to the integrations UI; frontend never calls this route directly                              |
| `DELETE /crm/connections/:provider`        | none                                                                     | disconnection confirmation; a remaining connected CRM becomes default automatically                     |
| `PATCH /crm/connections/:provider/default` | none                                                                     | selected default CRM connection                                                                         |
| `POST /crm/connections/:provider/sync`     | none                                                                     | `SYNCHRONIZED`, `PARTIAL`, or `IN_PROGRESS` result                                                      |
| `GET /crm/analytics/revenue`               | `provider?`, `groupBy=stage \| month`, `from?`, `to?`                    | currency-separated deterministic totals from local deal data                                            |
| `POST /crm/:provider/deals`                | deal creation body below                                                 | provider-confirmed, locally cached deal                                                                 |
| `PATCH /crm/:provider/deals/:externalId`   | any non-empty subset of the deal body                                    | provider-confirmed, locally cached deal                                                                 |
| `POST /crm/contacts`                       | `{ "name": "Tahid", "email": "tahid@example.com", "phone"?: "+880..." }` | contact created through the current default CRM                                                         |

`:provider` is exactly `HUBSPOT` or `SALESFORCE`. Connect, disconnect, set-default, manual-sync, contact creation, and deal writes require `OWNER` or `ADMIN`. Revenue analytics is available to authenticated organization users.

Deal create body:

```json
{
  "name": "Enterprise renewal",
  "amount": 60000,
  "currency": "USD",
  "providerStage": "Proposal",
  "closeDate": "2026-10-31T00:00:00.000Z",
  "ownerId": "provider-owner-id"
}
```

`currency`, `providerStage`, `closeDate`, and `ownerId` are optional. Update accepts any non-empty subset. CRM revenue is returned separately per currency; the frontend must not sum different currencies.

Revenue response shape:

```json
{
  "availability": "AVAILABLE",
  "groupBy": "stage",
  "range": { "from": "2026-01-01T00:00:00.000Z" },
  "currencies": [
    {
      "currency": "USD",
      "totalAmount": 60000,
      "dealCount": 1,
      "items": [{ "key": "OPEN", "amount": 60000, "dealCount": 1 }]
    }
  ]
}
```

CRM data is eventually consistent: `lastSyncedAt`, `syncStatus`, and `reconnectRequired` must be shown in the UI. `crm_deals` is the local analysis cache; provider confirmation completes before a platform deal write updates that cache.

### 19.5 `call_recordings`, `meeting_bots`, `meeting_transcripts`, and `ai_source_analyses` — call intelligence

This is the read model for completed Twilio calls and meeting-bot sources. It is separate from chat proposals but uses the same proposal collection for recommended follow-up tasks and meetings. All routes require org `OWNER` or `ADMIN`.

| Endpoint                                      | Request body / query                                                                       | Response data                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `GET /call-intelligence`                      | `page`, `limit`, optional `kind`, `sourceType`                                             | newest-first mixed call/meeting source list                                           |
| `GET /call-intelligence/:sourceId/details`    | required `sourceType`; optional `status`, `taskLimit`, `meetingLimit`, `includeTranscript` | source metadata, audio/transcript availability, stored analysis, and action proposals |
| `DELETE /call-intelligence/:sourceId/details` | required `sourceType` query                                                                | deletion result; active/processing source deletion is rejected                        |
| `GET /call-intelligence/:sourceId/report`     | details query plus `format` set to `html` or `json`                                        | binary attachment download, not JSON envelope                                         |
| `GET /call-intelligence/:sourceId/audio`      | required `sourceType` set to `CALL_AUDIO` or `CALL_TRANSCRIPT`                             | streamed audio response, not JSON envelope                                            |

Details response shape:

```json
{
  "source": { "type": "CALL_TRANSCRIPT", "id": "SOURCE_ID" },
  "metadata": { "kind": "CALL", "status": "COMPLETED", "durationSeconds": 180 },
  "audio": {
    "available": true,
    "downloadPath": "/api/v1/call-intelligence/SOURCE_ID/audio?sourceType=CALL_TRANSCRIPT"
  },
  "transcript": {
    "available": true,
    "included": false,
    "text": null,
    "segments": []
  },
  "analysis": { "id": "ANALYSIS_ID" },
  "actions": { "tasks": [], "meetings": [] },
  "extensions": { "crm": null }
}
```

For meeting-source audio, use `GET /meeting-bots/:meetingBotId/audio`, not the call audio endpoint. Request `includeTranscript=true` only when the user opens the transcript panel.

### 19.6 Calendar dashboard, synchronization, and event CRUD

**Collections/resources:** `managed_calendar_events`, `platform_meetings`,
`meeting_bots`, `tasks`, `ai_action_proposals`, and `ai_source_analyses`.

For the Calendar screen, use `GET /calendar/dashboard` as the canonical read
model. It merges and deduplicates platform meetings and synchronized calendar
events. Do not build this screen by merging `/meetings` and `/calendar/events`
in the browser.

| Endpoint                      | Access                 | Request body / query                                                        | Response data                            |
| ----------------------------- | ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| `GET /calendar/dashboard`     | Authenticated          | explicit range and display options                                          | unified Calendar-screen read model       |
| `POST /calendar/sync`         | Org `OWNER` or `ADMIN` | optional provider/range body                                                | Google/Outlook synchronization result    |
| `POST /calendar/events`       | Org `OWNER` or `ADMIN` | event body below                                                            | created event                            |
| `GET /calendar/events`        | Authenticated          | list query                                                                  | event list                               |
| `GET /calendar/events/:id`    | Authenticated          | none                                                                        | one event                                |
| `PATCH /calendar/events/:id`  | Org `OWNER` or `ADMIN` | changed event fields                                                        | updated event                            |
| `DELETE /calendar/events/:id` | Org `OWNER` or `ADMIN` | none                                                                        | cancelled event                          |
| `GET /calendar/connections`   | Authenticated          | none                                                                        | Google/Outlook calendar connection cards |
| `PATCH /calendar/default`     | Org `OWNER` or `ADMIN` | `{ "provider": "GOOGLE_CALENDAR" }` or `{ "provider": "OUTLOOK_CALENDAR" }` | selected default calendar                |

#### 19.6.1 Synchronize Google/Outlook events

The Sync Calendar quick action calls:

```http
POST /calendar/sync
Content-Type: application/json
```

Synchronize every connected provider using the default range:

```json
{}
```

Or synchronize one provider and an explicit range:

```json
{
  "provider": "GOOGLE_CALENDAR",
  "from": "2026-09-01T00:00:00.000Z",
  "to": "2026-10-01T00:00:00.000Z"
}
```

`provider` is `GOOGLE_CALENDAR` or `OUTLOOK_CALENDAR`. If omitted, every
connected calendar is synchronized. If the range is omitted, the backend uses
30 days before the request through 365 days after it. An explicit range cannot
exceed 730 days.

Response:

```json
{
  "availability": "AVAILABLE",
  "synchronizedAt": "2026-09-25T08:00:00.000Z",
  "range": {
    "from": "2026-09-01T00:00:00.000Z",
    "to": "2026-10-01T00:00:00.000Z"
  },
  "providers": [
    {
      "provider": "GOOGLE_CALENDAR",
      "status": "SYNCHRONIZED",
      "synchronized": 18,
      "skipped": 0
    }
  ],
  "totalSynchronized": 18
}
```

Provider events are idempotently upserted by organization, provider, and
provider event ID. Deleted/cancelled provider events update an existing local
record to `CANCELLED`; a deletion notification with no matching local record
is safely skipped.

When one connected provider fails and another succeeds, the request succeeds
with `availability: "PARTIAL"`; the failed provider entry has `status:
"FAILED"`, `synchronized: 0`, and `error`. If every selected provider fails,
the route returns `503`. Re-fetch `GET /calendar/dashboard` after every full or
partial success.

This is an explicit user action. The frontend must not assume a periodic
background sync exists.

#### 19.6.2 Calendar dashboard read model

```http
GET /calendar/dashboard?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&timezone=Asia%2FDhaka&bufferMinutes=15&upcomingLimit=8&conflictLimit=20
```

Query:

| Field           | Required | Rule                                          |
| --------------- | -------- | --------------------------------------------- |
| `from`          | yes      | ISO-8601 range start                          |
| `to`            | yes      | ISO-8601 range end; range maximum is 730 days |
| `timezone`      | no       | valid IANA timezone; default `UTC`            |
| `bufferMinutes` | no       | `0..240`; default `15`                        |
| `upcomingLimit` | no       | `1..50`; default `8`                          |
| `conflictLimit` | no       | `1..100`; default `20`                        |

Use the visible day/week/month/year boundary for `from` and `to`. Keep the
same explicit timezone while navigating the calendar.

Condensed response shape:

```json
{
  "asOf": "2026-09-25T08:00:00.000Z",
  "timezone": "Asia/Dhaka",
  "range": {
    "from": "2026-09-01T00:00:00.000Z",
    "to": "2026-10-01T00:00:00.000Z"
  },
  "dataAvailability": { "availability": "AVAILABLE" },
  "summary": {
    "total": 20,
    "scheduled": 11,
    "completed": 5,
    "cancelled": 4,
    "failed": 0,
    "series": [
      {
        "date": "2026-09-25",
        "total": 3,
        "scheduled": 2,
        "completed": 1,
        "cancelled": 0
      }
    ]
  },
  "items": [
    {
      "id": "MEETING_OR_EVENT_ID",
      "sourceType": "PLATFORM_MEETING",
      "title": "Client review",
      "description": "Review delivery and next steps",
      "startsAt": "2026-09-27T09:00:00.000Z",
      "endsAt": "2026-09-27T09:30:00.000Z",
      "durationMinutes": 30,
      "timezone": "Asia/Dhaka",
      "participantEmails": ["client@example.com"],
      "status": "SCHEDULED",
      "provider": "GOOGLE_MEET",
      "eventUrl": "https://calendar.google.com/..."
    }
  ],
  "upcoming": [],
  "conflicts": {
    "items": [
      {
        "type": "OVERLAP",
        "meetingIds": ["MEETING_ID_1", "MEETING_ID_2"],
        "meetings": ["Sales review", "Client follow-up"],
        "startsAt": "2026-09-27T09:15:00.000Z",
        "overlapMinutes": 15
      }
    ],
    "travelTime": {
      "availability": "UNAVAILABLE",
      "reason": "MEETING_LOCATIONS_NOT_CAPTURED"
    }
  },
  "taskAndCalls": {
    "tasksCreatedFromCalls": 2,
    "upcomingDeadlines": 3,
    "aiReminders": 1,
    "followUpsPending": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "FOLLOW_UP_WORKFLOW_NOT_CONFIGURED"
    },
    "crmUpdatesToday": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "CRM_FOUNDATION_NOT_IMPLEMENTED"
    }
  },
  "priority": {
    "availability": "PARTIAL",
    "classified": 8,
    "unclassified": 12,
    "counts": { "high": 2, "medium": 5, "low": 1 },
    "averageScore": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "MEETING_PRIORITY_SCORE_METHODOLOGY_NOT_CONFIGURED"
    },
    "confidenceScores": {
      "availability": "UNAVAILABLE",
      "items": [],
      "reason": "AI_MEETING_SCORING_NOT_IMPLEMENTED"
    }
  },
  "automation": {
    "notesGenerated": 4,
    "actionItemsCreated": 7,
    "tasksAssigned": 3,
    "followUpEmailsSent": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "EMAILS_NOT_LINKED_TO_MEETINGS"
    },
    "crmRecordsUpdated": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "CRM_FOUNDATION_NOT_IMPLEMENTED"
    },
    "customerHealthUpdated": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "CUSTOMER_FOUNDATION_NOT_IMPLEMENTED"
    }
  },
  "aiScheduling": {
    "availability": "UNAVAILABLE",
    "suggestions": [],
    "reason": "AI_SCHEDULING_CONTRACT_NOT_IMPLEMENTED"
  }
}
```

Response usage:

- `summary` powers Total, Scheduled, Completed, and Cancelled cards and their
  date series. Missing dates are zero; the backend does not emit empty dates.
- `summary.total` includes scheduled, completed, and cancelled records;
  `failed` is reported separately and is not included in `total`.
- `items` powers the calendar grid, selected-day agenda, and status table.
- `upcoming` is already sorted and limited.
- `sourceType` determines details/actions: `PLATFORM_MEETING` uses
  `/meetings/:id`; `CALENDAR_EVENT` uses `/calendar/events/:id`.
- Edit with the matching `PATCH` route and cancel with the matching `DELETE`
  route. There is no separate frontend “mark complete” call; bot lifecycle is
  authoritative for platform meetings.
- Normalized item statuses are `SCHEDULED`, `COMPLETED`, `CANCELLED`, or
  `FAILED`.
- `COMPLETED` is authoritative for platform meetings because every current
  platform flow uses a bot. A synchronized standalone external event has no
  bot completion signal and remains scheduled or cancelled; do not infer a
  completed state in the browser.
- `participantEmails` is the current participant identity. Do not expect CRM
  names or phone numbers yet.
- `conflicts.items[].type` is `OVERLAP` or `INSUFFICIENT_BUFFER`. Travel-time
  conflicts remain unavailable until meeting locations are captured.
- `priority.availability` can be `PARTIAL` because urgency exists for managed
  calendar events but not every platform/external meeting. Do not manufacture
  values for `unclassified` meetings.
- `priority.averageScore`, `priority.confidenceScores`, meeting-linked
  follow-up email counts, CRM updates, and customer-health updates can return
  `UNAVAILABLE`; render an unavailable/hidden state instead of `0`.
- `aiScheduling` remains unavailable until the AI Backend implements the
  Calendar Intelligence contract. The frontend must not call the AI Backend
  directly.
- If either underlying source exceeds the safety limit, `dataAvailability` is
  `PARTIAL` with reason `CALENDAR_RANGE_RESULT_LIMIT_REACHED`; narrow the
  visible range.
- `tasksCreatedFromCalls`, meeting analysis/notes, action items, and assigned
  task automation counts use records produced within the requested range.
  `upcomingDeadlines` and `aiReminders` count open tasks due from `asOf` up to
  `to`.

#### 19.6.3 Direct event CRUD

Event create example:

```json
{
  "title": "Quarterly planning",
  "description": "Review goals and agree next actions",
  "meetingType": "OTHER",
  "urgency": "MEDIUM",
  "startTime": "2026-10-01T10:00:00.000Z",
  "endTime": "2026-10-01T10:30:00.000Z",
  "attendees": ["guest@example.com"],
  "timezone": "Asia/Dhaka",
  "reminderMinutesBeforeStart": 15,
  "idempotencyKey": "calendar-event-01J7Y6A"
}
```

Reuse `idempotencyKey` when retrying the same event create request. Use
`POST /meetings` from section 7 when the platform must create a provider
Google Meet or Zoom URL.

`GET /calendar/events` supports `page`, `limit`, `provider`, `meetingType`,
`status`, `from`, and `to`. It remains useful for resource-specific
administration, but do not use it alone for the Calendar dashboard because it
does not include `platform_meetings`.

List response:

```json
{
  "items": [
    {
      "id": "CALENDAR_EVENT_ID",
      "provider": "GOOGLE_CALENDAR",
      "providerEventId": "provider-event-id",
      "providerEventUrl": "https://calendar.google.com/...",
      "title": "Quarterly planning",
      "meetingType": "OTHER",
      "urgency": "MEDIUM",
      "startsAt": "2026-10-01T10:00:00.000Z",
      "endsAt": "2026-10-01T10:30:00.000Z",
      "timezone": "Asia/Dhaka",
      "attendees": ["guest@example.com"],
      "status": "SCHEDULED",
      "importedFromProvider": false
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

`PATCH /calendar/events/:id` accepts any changed create fields except
`idempotencyKey`. `DELETE /calendar/events/:id` cancels the provider event and
returns the event with `status: "CANCELLED"`; it is not a hard delete.

#### 19.6.4 Calendar connection selector

```http
GET /calendar/connections
```

```json
{
  "defaultProvider": "GOOGLE_CALENDAR",
  "connections": [
    {
      "provider": "GOOGLE_CALENDAR",
      "connected": true,
      "status": "CONNECTED",
      "isDefault": true,
      "account": {
        "id": "provider-account-id",
        "email": "owner@example.com",
        "name": "Owner"
      },
      "connectedByUserId": "USER_ID",
      "expiresAt": "2026-09-25T09:00:00.000Z"
    },
    {
      "provider": "OUTLOOK_CALENDAR",
      "connected": false,
      "status": "DISCONNECTED",
      "isDefault": false,
      "account": {}
    }
  ]
}
```

Select a connected provider as the organization default:

```http
PATCH /calendar/default
Content-Type: application/json
```

```json
{
  "provider": "OUTLOOK_CALENDAR"
}
```

The response has the same shape as `GET /calendar/connections`. Use the OAuth
routes in section 7.1 when a provider is disconnected; do not call OAuth
callbacks from frontend JavaScript.

## 20. Commercial Catalog, Billing, Subscription, Invoice, and Usage

### 20.1 `subscription_plans` — public plan catalog and platform administration

| Endpoint                                  | Access         | Request body / query                                                   | Response data                |
| ----------------------------------------- | -------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `GET /subscription-plans`                 | Public         | optional `billingCycle` set to `month` or `year`                       | active plan catalog          |
| `GET /subscription-plans/estimate`        | Public         | `monthlyCalls`, `monthlyActions`, `meetingHours` non-negative integers | recommended plan and add-ons |
| `GET /subscription-plans/admin`           | Platform admin | `includeInactive`, `billingCycle`                                      | full plan catalog            |
| `GET /subscription-plans/:id`             | Platform admin | none                                                                   | one plan                     |
| `GET /subscription-plans/:id/subscribers` | Platform admin | subscription list query                                                | paginated subscribers        |
| `POST /subscription-plans`                | Platform admin | plan body below                                                        | created plan                 |
| `PATCH /subscription-plans/:id`           | Platform admin | partial plan body                                                      | updated plan                 |
| `DELETE /subscription-plans/:id`          | Platform admin | none                                                                   | deletion/deactivation result |

Plan create body:

```json
{
  "planType": "GROWTH",
  "name": "Growth",
  "tagline": "For scaling teams",
  "priceUsd": 99,
  "billingCycles": ["month", "year"],
  "annualPriceUsd": 950,
  "isInquiryOnly": false,
  "aiActionsPerMonth": 1000,
  "crmContactsLimit": 5000,
  "callMinutesPerMonth": 1000,
  "meetingHoursPerMonth": 100,
  "usersIncluded": 10,
  "aiAgentsIncluded": 6,
  "trialDays": 14,
  "extraAiActionPriceUsd": 0.1,
  "extraCallMinutePriceUsd": 0.05,
  "features": ["AI Chief of Staff"],
  "isMostPopular": true,
  "customizationIncluded": false,
  "isActive": true,
  "sortOrder": 10
}
```

Plan records return the commercial fields above plus their ID and timestamps. The frontend must use server prices and entitlement values; do not calculate or submit prices from the browser.

### 20.2 `addon_products` — public add-on catalog

| Endpoint                     | Access         | Request body / query               | Response data                |
| ---------------------------- | -------------- | ---------------------------------- | ---------------------------- |
| `GET /addon-products`        | Public         | none                               | active add-on products       |
| `GET /addon-products/admin`  | Platform admin | optional `includeInactive` boolean | full catalog                 |
| `GET /addon-products/:id`    | Platform admin | none                               | one add-on product           |
| `POST /addon-products`       | Platform admin | add-on body below                  | created add-on               |
| `PATCH /addon-products/:id`  | Platform admin | partial add-on body                | updated add-on               |
| `DELETE /addon-products/:id` | Platform admin | none                               | deletion/deactivation result |

```json
{
  "category": "AI_ACTIONS",
  "name": "AI Action Pack",
  "description": "Additional AI actions",
  "isInquiryOnly": false,
  "isActive": true,
  "sortOrder": 10,
  "tiers": [{ "label": "1,000 actions", "quantity": 1000, "priceUsd": 49 }]
}
```

### 20.3 `organization_subscriptions`, `cancellation_requests`, and billing actions

| Endpoint                                     | Access        | Request body                                            | Response data                                 |
| -------------------------------------------- | ------------- | ------------------------------------------------------- | --------------------------------------------- |
| `GET /subscriptions/me`                      | Authenticated | none                                                    | current organization subscription             |
| `POST /billing/checkout-session`             | Authenticated | `{ "planType", "successUrl", "cancelUrl" }`             | Stripe Checkout session / redirect URL        |
| `POST /billing/checkout-session-with-addons` | Authenticated | checkout-with-addons body below                         | Stripe Checkout session / redirect URL        |
| `POST /billing/addons`                       | Authenticated | `{ "addonProductId", "tierIndex" }`                     | subscription with add-on updated              |
| `DELETE /billing/addons/:category`           | Authenticated | none                                                    | subscription with add-on removed              |
| `POST /billing/upgrade`                      | Authenticated | `{ "planType": "..." }`                                 | changed subscription                          |
| `POST /billing/pause`                        | Authenticated | `{ "days": 30 }`, `{ "days": 60 }`, or `{ "days": 90 }` | paused subscription                           |
| `POST /billing/resume`                       | Authenticated | none                                                    | resumed subscription                          |
| `POST /subscriptions/me/cancel`              | Authenticated | cancellation body below                                 | pending cancellation request                  |
| `GET /subscriptions/me/cancel`               | Authenticated | none                                                    | pending cancellation or empty/not-found state |
| `POST /subscriptions/me/cancel/undo`         | Authenticated | none                                                    | restored subscription/cancellation state      |
| `POST /subscriptions/me/downgrade-request`   | Authenticated | `{ "requestedPlanName", "note"?: "..." }`               | created sales inquiry                         |
| `POST /subscriptions/me/specialist-request`  | Authenticated | `{ "note"?: "..." }`                                    | created sales inquiry                         |

Cancellation body:

```json
{
  "reason": "TOO_EXPENSIVE",
  "reasonDetail": "Optional; required by backend when reason is OTHER",
  "retentionOfferChoice": "NONE",
  "password": "Current-password"
}
```

The response is authoritative for effective cancellation date, grace period, plan/status, Stripe subscription state, and any retention offer. Do not mark a subscription cancelled solely because the request was submitted.

Checkout with add-ons body: provide exactly one of `planType` or `planId`; `tierIndex` is zero-based within the selected add-on product's `tiers` array.

```json
{
  "planType": "GROWTH",
  "successUrl": "https://app.example/billing/success",
  "cancelUrl": "https://app.example/billing/cancel",
  "addons": [{ "addonProductId": "ADDON_PRODUCT_ID", "tierIndex": 0 }]
}
```

### 20.4 `invoices`, `revenue_snapshots`, and platform subscription operations

All routes in this subsection require platform admin.

| Endpoint                                                      | Request body / query                                               | Response data                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| `GET /invoices`                                               | invoice filters/pagination                                         | cached Stripe invoice list                          |
| `POST /invoices/sync/subscription/:subscriptionId`            | none                                                               | synced invoice data                                 |
| `GET /invoices/:id`                                           | none                                                               | one invoice                                         |
| `GET /invoices/:id/download`                                  | none                                                               | HTTP redirect to hosted Stripe PDF; open in browser |
| `DELETE /invoices/:id`                                        | none                                                               | deletion result                                     |
| `GET /subscriptions-admin`                                    | `search`, `planType`, `status`, `billingInterval`, `page`, `limit` | paginated organization subscriptions                |
| `GET /subscriptions-admin/:id`                                | none                                                               | one subscription                                    |
| `GET /subscriptions-admin/cancellation-requests`              | `status`, `page`, `limit`                                          | cancellation queue                                  |
| `POST /subscriptions-admin/cancellation-requests/:id/execute` | none                                                               | executed cancellation                               |
| `POST /subscriptions-admin/cancellation-requests/:id/undo`    | none                                                               | cancellation undone                                 |
| `GET /subscription-analytics/overview-cards`                  | none                                                               | active subscriptions, MRR, ARR, renewals            |
| `GET /subscription-analytics/revenue-overview`                | `year` optional                                                    | monthly revenue series                              |
| `GET /subscription-analytics/plan-distribution`               | none                                                               | plan distribution series                            |

### 20.5 `usage_records` and `call_usage_periods`

| Endpoint            | Access        | Request body / query | Response data                      |
| ------------------- | ------------- | -------------------- | ---------------------------------- |
| `GET /usage`        | Authenticated | none                 | available product usage records    |
| `GET /twilio/usage` | Org `OWNER`   | none                 | current Twilio minute usage/limits |

## 21. Onboarding and Setup Catalog

### 21.1 `setup_packages` — paid setup catalog

| Endpoint                        | Access         | Request body / query       | Response data                |
| ------------------------------- | -------------- | -------------------------- | ---------------------------- |
| `GET /setup-packages`           | Public         | none                       | active setup package catalog |
| `GET /setup-packages/admin`     | Platform admin | none                       | all packages                 |
| `GET /setup-packages/admin/:id` | Platform admin | none                       | one package                  |
| `POST /setup-packages`          | Platform admin | setup package body         | created package              |
| `PATCH /setup-packages/:id`     | Platform admin | partial setup package body | updated package              |

```json
{
  "code": "CRM_SETUP",
  "name": "CRM Foundation Setup",
  "description": "Configure the initial CRM workflow",
  "setupType": "SELF_CONNECT",
  "setupFeeType": "PAID_ADDON",
  "price": 500,
  "currency": "USD",
  "isActive": true,
  "sortOrder": 10
}
```

### 21.2 `onboarding_setups` and `onboarding_availability` — customer setup workflow

| Endpoint                                               | Access              | Request body / query                                                            | Response data                        |
| ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| `POST /onboarding-setups`                              | Authenticated       | `{ "setupPackageId", "paymentSuccessUrl"?: "...", "paymentCancelUrl"?: "..." }` | created setup record                 |
| `GET /onboarding-setups/my`                            | Authenticated       | none                                                                            | signed-in user's setup records       |
| `GET /onboarding-setups/availability`                  | Authenticated       | none                                                                            | public onboarding availability rules |
| `GET /onboarding-setups/:id`                           | Authenticated owner | none                                                                            | one setup record                     |
| `GET /onboarding-setups/:id/available-slots`           | Authenticated owner | `date=YYYY-MM-DD`, `timezone?`                                                  | UTC slots for selected date          |
| `POST /onboarding-setups/:id/book-meeting`             | Authenticated owner | `{ "startTime", "timezone"?: "Asia/Dhaka", "notes"?: "..." }`                   | booked setup meeting                 |
| `POST /onboarding-setups/:id/payment/checkout-session` | Authenticated owner | `{ "successUrl", "cancelUrl" }`                                                 | Stripe Checkout session              |
| `POST /onboarding-setups/:id/cancel`                   | Authenticated owner | none                                                                            | cancelled setup                      |

Use a `startTime` returned by available-slots. `endTime` is calculated by backend; do not rely on the legacy optional client `endTime` field.

Availability management below requires platform admin. The setup-queue routes currently use the backend's `OWNER`/`ADMIN` role guard; they do not require `isPlatformAdmin` in the present implementation.

| Endpoint                                          | Request body / query                                                              | Response data                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| `GET /onboarding-setups/admin/availability`       | none                                                                              | platform availability configuration |
| `PUT /onboarding-setups/admin/availability`       | availability body below                                                           | saved configuration                 |
| `GET /onboarding-setups/admin/list`               | Org `OWNER` or `ADMIN`; `status`, `setupType`, `assignedAdminId`, `page`, `limit` | paginated setup queue               |
| `GET /onboarding-setups/admin/:id`                | Org `OWNER` or `ADMIN`                                                            | setup details                       |
| `PATCH /onboarding-setups/admin/:id/assign-admin` | Org `OWNER` or `ADMIN`; `{ "adminId": "USER_ID" }`                                | updated setup                       |
| `POST /onboarding-setups/admin/:id/notes`         | Org `OWNER` or `ADMIN`; `{ "note": "...", "statusNote"?: "..." }`                 | updated setup                       |
| `POST /onboarding-setups/admin/:id/complete`      | Org `OWNER` or `ADMIN`                                                            | completed setup                     |

Availability body:

```json
{
  "timezone": "Asia/Dhaka",
  "startDate": "2026-10-01",
  "endDate": null,
  "weekdays": [0, 1, 2, 3, 4, 5, 6],
  "dailyStartTime": "09:00",
  "dailyEndTime": "22:00",
  "meetingDurationMinutes": 90,
  "bufferMinutes": 15,
  "blockedDates": ["2026-10-03"],
  "isActive": true
}
```

## 22. Telephony, Social Integration, Dashboard, Audit, and Public Utilities

### 22.1 `twilio_accounts`, `twilio_phone_numbers`, and `twilio_settings`

These routes are organization-owner-only. The browser never receives Twilio auth tokens, API keys, or subaccount secrets.

| Endpoint                                     | Request body / query                                                               | Response data                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `POST /twilio/settings`                      | `{ "twilioNumber", "forwardingNumber", "isRecordingEnabled"?, "status"? }`         | saved safe Twilio setting view                          |
| `GET /twilio/connection`                     | none                                                                               | connection/provisioning status and masked safe metadata |
| `GET /twilio/usage`                          | none                                                                               | current usage and entitlement/limit information         |
| `GET /twilio/numbers/available`              | required `country`; optional `areaCode`, `contains`, `locality`, `region`, `limit` | purchasable voice numbers                               |
| `POST /twilio/connection`                    | `{ "phoneNumber", "country", "forwardingNumber", "isRecordingEnabled"? }`          | `202 Accepted` provisioning job/state                   |
| `POST /twilio/connection/retry`              | none                                                                               | `202 Accepted` retry state                              |
| `PATCH /twilio/connection/forwarding-number` | `{ "forwardingNumber": "+880..." }`                                                | updated connection                                      |
| `POST /twilio/connection/close`              | `{ "confirmClose": true }`                                                         | `202 Accepted` closure request                          |

Treat `PROVISIONING`, `FAILED`, `ACTIVE`, and closing states from the response as server-owned workflow states. On `FAILED`, show the provided safe error and allow the explicit retry route; do not start duplicate provisioning requests.

### 22.2 `integrations` — integration cards

```http
GET /integrations
```

Authenticated response data:

```json
{
  "organizationId": "ORG_ID",
  "items": [
    {
      "provider": "GMAIL",
      "label": "Gmail",
      "connected": true,
      "status": "CONNECTED",
      "connectPath": "/email/connections/GOOGLE/connect",
      "account": { "email": "owner@example.com" },
      "expiresAt": "2026-10-01T00:00:00.000Z"
    }
  ]
}
```

Use `connectPath` or the dedicated canonical OAuth routes. Do not construct a provider authorization URL on the frontend.

### 22.3 `integrations` — Meta/Facebook connection and read-only data

| Endpoint                                         | Access            | Request body / query            | Response data                                   |
| ------------------------------------------------ | ----------------- | ------------------------------- | ----------------------------------------------- |
| `GET /meta/connect`                              | Authenticated     | none                            | `{ "authorizationUrl": "..." }`                 |
| `GET /meta/callback`                             | Provider callback | `code`, `state`, `error?` query | provider callback result; not an app-screen API |
| `GET /meta/connection`                           | Authenticated     | none                            | current Meta connection state                   |
| `GET /meta/pages/:pageId/posts`                  | Authenticated     | list query                      | provider post list                              |
| `GET /meta/pages/:pageId/posts/:postId/comments` | Authenticated     | list query                      | provider comment list                           |
| `GET /meta/pages/:pageId/messages`               | Authenticated     | list query                      | provider message list                           |
| `GET /meta/pages/:pageId/insights`               | Authenticated     | insight query                   | provider insight data                           |
| `GET /meta/pages/:pageId/overview`               | Authenticated     | overview query                  | provider page overview                          |

The connect route returns an authorization URL; redirect the browser to it. Do not call callback manually. Provider API responses may vary by permission, token, page, and Graph API version; render missing provider fields defensively.

Shared Meta list query fields: `date` or paired `fromDate`/`toDate` (`YYYY-MM-DD`), optional `startTime`, `endTime` (`HH:mm` or `HH:mm:ss`), `timezoneOffset` (`Z` or URL-encoded `%2B06:00`), and `limit` (`1..100`). Insights and overview also accept comma-separated `metrics` and optional `period` (for example `day`).

### 22.4 Computed `organizer-dashboard` read model

No dedicated dashboard collection exists. The backend derives this read model from tasks, meetings, AI telemetry, call intelligence and briefings. All routes require org `OWNER` or `ADMIN`.

| Endpoint                                      | Query                            | Response data                                                         |
| --------------------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `GET /organizer-dashboard/summary`            | `days` (`2..30`, default `7`)    | KPI cards, trends, and current dashboard summary                      |
| `GET /organizer-dashboard/workforce`          | `page`, `limit`, `activityHours` | global agent catalog with organization runtime activity               |
| `GET /organizer-dashboard/upcoming-meetings`  | `limit` (`1..20`, default `4`)   | deduplicated upcoming meetings                                        |
| `GET /organizer-dashboard/today-briefing`     | none                             | latest eligible today briefing or empty state                         |
| `GET /organizer-dashboard/recent-voice-notes` | `limit` (`1..20`, default `4`)   | recent call-intelligence voice-note cards                             |
| `GET /organizer-dashboard/task-overview`      | none                             | task counts, local-week trends, productivity and department breakdown |
| `GET /organizer-dashboard/top-priorities`     | `limit` (`1..20`, default `4`)   | ranked task priorities                                                |

Dashboard responses are read models. Do not PATCH them; mutate the underlying task, meeting, briefing, or proposal resource through its own canonical endpoint.

The task overview keeps the original top-level all-time snapshot fields for compatibility and adds a timezone-aware current-week model:

```json
{
  "asOf": "2026-09-24T10:00:00.000Z",
  "timezone": "Asia/Dhaka",
  "total": 11,
  "completed": 2,
  "inProgress": 3,
  "pending": 5,
  "overdue": 1,
  "snapshot": {
    "total": 11,
    "completed": 2,
    "inProgress": 3,
    "pending": 5,
    "overdue": 1
  },
  "period": {
    "type": "THIS_WEEK",
    "basis": "DUE_DATE_COHORT_CURRENT_STATUS",
    "start": "2026-09-20T18:00:00.000Z",
    "end": "2026-09-27T18:00:00.000Z",
    "dueToInclusive": "2026-09-27T17:59:59.999Z",
    "counts": {},
    "previous": { "start": "...", "end": "...", "counts": {} },
    "comparison": {
      "total": { "current": 10, "previous": 8, "changePercent": 25 }
    },
    "series": []
  },
  "productivity": {
    "period": "THIS_WEEK",
    "counts": {},
    "completionRate": 20,
    "overallScore": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "PRODUCTIVITY_SCORE_METHODOLOGY_NOT_CONFIGURED"
    }
  },
  "taskBreakdown": {
    "period": "THIS_WEEK",
    "items": [{ "department": "SALES", "count": 4, "percentage": 40 }],
    "averageScore": {
      "availability": "UNAVAILABLE",
      "value": null,
      "reason": "TASK_SCORE_METHODOLOGY_NOT_CONFIGURED"
    }
  }
}
```

The weekly series and comparison use tasks whose `dueDate` falls inside each local week and classify them by their current status. `changePercent` is `null` when the previous value is zero and the current value is non-zero. Scores remain explicitly unavailable until a product-approved methodology exists; the frontend must not substitute a fabricated number.

### 22.5 `audit_logs` — organization audit trail

```http
GET /audit-logs
```

Requires org `OWNER` or `ADMIN`. Response is an organization-scoped list of audit records, for example:

```json
[
  {
    "id": "AUDIT_ID",
    "organizationId": "ORG_ID",
    "userId": "USER_ID",
    "action": "SUPPORT_REQUEST_CREATED",
    "resourceType": "SUPPORT_REQUEST",
    "resourceId": "RESOURCE_ID",
    "metadata": {},
    "createdAt": "2026-09-24T10:00:00.000Z"
  }
]
```

Audit logs are read-only from the frontend.

### 22.6 `package_inquiries` — public sales/package lead form

```http
POST /package-inquiries
Content-Type: application/json
```

Public body:

```json
{
  "fullName": "Rifat Hossain",
  "email": "rifat@example.com",
  "message": "I would like a product demo.",
  "acceptContactConsent": true
}
```

Response data is the created inquiry with `id`, `packageType`, `status`, and timestamps. `packageType` is server-selected for this public form. This endpoint is rate-limited; preserve user input on `429`.

### 22.7 Health check

```http
GET /health
```

Public response is a service-health payload. It is suitable for operational monitoring or a lightweight status indicator, not for user business metrics.

## 23. Platform-Only and Non-Frontend Routes

The following are real backend routes but must not be included in normal organization-user frontend flows:

| Route family                                                                               | Why it is excluded from normal frontend integration                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/webhooks/billing/*`, `/webhooks/twilio/*`, `/webhooks/recall/*`                          | Provider-to-server callbacks; provider signatures and raw request validation are required.                                                                                                    |
| `/ai-actions/*` and `/call-intelligence/:sourceId/action-center`                           | Deprecated compatibility routes. Use `/call-intelligence/proposals/*` from section 6.                                                                                                         |
| `POST/GET/PATCH/DELETE /google-meetings/*` and `/zoom-meetings/*` manual meeting-bot flows | Provider-specific legacy/manual duplicates. Use section 7.5's cross-provider `/meeting-bots` route for a deliberate manual bot flow, or `/meetings` for a connected provider-created meeting. |
| `/ai-internal/*`                                                                           | Internal service-to-service agent catalog/API surface, never browser UI.                                                                                                                      |
| `/notifications/admin/product-updates`                                                     | Platform-admin publishing tool; use only in an explicitly built platform-admin console.                                                                                                       |

If a future screen needs one of these capabilities, add it deliberately to this document after reviewing permission and provider implications. Do not discover or call hidden routes from the frontend.

## 24. Full-Project Frontend Delivery Checklist

- [ ] Every request uses `/api/v1` and the current bearer token unless marked Public.
- [ ] All normal JSON responses are read from `response.data.data` when using an HTTP client that preserves the backend envelope.
- [ ] Query pagination shape is handled per endpoint: `pagination` nested for modern modules, root pagination fields for older admin modules.
- [ ] Mongo IDs from path-bearing responses are retained exactly; display IDs such as `ticketId` are never substituted into path parameters.
- [ ] OAuth flows open the backend-issued `authorizationUrl`; callbacks and webhooks are never called by frontend JavaScript.
- [ ] Optimistic update is avoided for financial, email-send, AI execution, provisioning, cancellation, and provider-facing state changes; re-render server response instead.
- [ ] `409` causes a resource re-fetch; `429` preserves the form and applies retry guidance; `5xx` never causes fabricated success state.
- [ ] Platform-admin endpoints are hidden from organization users and require a verified `isPlatformAdmin` user.
- [ ] Deprecated and internal route families in section 23 are not used.
