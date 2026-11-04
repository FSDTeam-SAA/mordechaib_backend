# Persisted AI Messages Streaming API

## Purpose

`POST /api/v1/messages` supports both the existing queued JSON workflow and a
new synchronous Server-Sent Events (SSE) workflow. The route, request fields,
conversation ownership, attachments, AI validation, and task/meeting/CRM
proposal persistence remain shared.

Frontend must send one request per user message. It must never call a second
AI route for the same message.

## Select the response mode

### Streaming mode

```http
POST /api/v1/messages
Authorization: Bearer <user-access-token>
Accept: text/event-stream
Content-Type: application/json
```

### Existing polling fallback

```http
POST /api/v1/messages
Authorization: Bearer <user-access-token>
Accept: application/json
Content-Type: application/json
```

Without `Accept: text/event-stream`, Main Backend preserves the existing `201`
JSON acknowledgement and BullMQ processing flow.

## Request

The existing body is unchanged:

```json
{
  "startNewConversation": true,
  "clientMessageId": "f7021e38-5674-4a18-9580-10a843a1f876",
  "content": "Schedule a Google Meet with Tauhid tomorrow at 3 PM",
  "selectedAgentId": "6aa51d1f9e98784ad5265250"
}
```

For an existing conversation:

```json
{
  "startNewConversation": false,
  "conversationId": "6ad98c57add382b9eb0fe914",
  "clientMessageId": "6a83aee7-bc4e-420d-879d-159669a3b7d7",
  "content": "Use tauhid@example.com"
}
```

### Streaming with files

Use the same route and fields, but send `multipart/form-data`. Do not set the
`Content-Type` header manually; the browser must add its multipart boundary.

```ts
const form = new FormData();
form.append('startNewConversation', 'true');
form.append('clientMessageId', crypto.randomUUID());
form.append('content', 'Review these files and create the necessary task');
if (selectedAgentId) form.append('selectedAgentId', selectedAgentId);
for (const file of files) form.append('files', file);

const response = await fetch(`${API_URL}/api/v1/messages`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'text/event-stream',
  },
  body: form,
});
```

For an existing conversation, send `startNewConversation=false` and include
`conversationId`. Attachment-only messages are valid; `content` may be omitted
when at least one file is present.

AI streaming attachments are limited to:

- maximum 5 files;
- maximum 20 MB combined per request;
- PDF and DOCX documents;
- PNG, JPEG, WEBP, and GIF images.

Main Backend persists the normal private message attachments, then forwards
the unchanged structured chat-turn fields and raw files to AI Backend as
multipart. The SSE events and terminal `result` contract do not change.

For Main Backend-to-AI transport, every former top-level JSON property keeps
the same form-field name. String values are sent directly; object and array
values are JSON-encoded in their corresponding form fields. Files use repeated
`files` parts. AI Backend must parse those fields back into the existing
`AiChatTurnRequest`; it must not introduce a different response model.

The response can still be streamed when the request uses multipart; the
`Accept` header selects the response mode independently from `Content-Type`.

## Stream contract

Success starts with:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

Main Backend first emits the persisted source message:

```text
event: message_created
data: {"id":"...","conversationId":"...","processingStatus":"PROCESSING",...}

```

It then forwards AI progress events without persistence:

```text
event: activity
data: {"stage":"planning",...}

event: text_delta
data: {"text":"I can help"}

event: text_reset
data: {}

: ping

```

The AI `result` event contains the existing structured `AiChatTurnResponse`.
Main Backend does not forward that terminal event until it has:

1. validated IDs, selected agent, and discriminated result type;
2. persisted the AI reply;
3. persisted any clarification/task/meeting/CRM proposal;
4. marked the source user message `COMPLETED`.

Then the unchanged terminal event is forwarded:

```text
event: result
data: {"schemaVersion":"1.0","turnId":"...","reply":{...},"result":{"type":"MEETING_PROPOSAL",...}}

```

`result` is authoritative for final UI text. Refreshing the conversation or
proposal list after it arrives returns the persisted records.

If AI emits `event: error`, Main Backend marks the source message `FAILED`,
forwards that event, and ends the stream. If the transport fails after headers
start, Main Backend emits a bounded `502` error event. If validation or AI
connection fails before streaming starts, the normal JSON error envelope is
returned.

## Persistence rules

Persisted:

- conversation and user message;
- attachments;
- final AI reply;
- clarification, task, meeting, or CRM proposal;
- processing status and operational telemetry.

Raw AI upload bytes are scoped to the current HTTP turn. The normal private
message attachment remains available through the authorized attachment APIs.

Not persisted:

- activity events;
- text deltas and resets;
- keep-alive pings.

Client disconnect aborts the upstream AI request and marks an unfinished
source message failed. Retrying with the same `clientMessageId` reuses the
source message and AI idempotency contract.

## Frontend example

```ts
const response = await fetch(`${API_URL}/api/v1/messages`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    startNewConversation: true,
    clientMessageId: crypto.randomUUID(),
    content: 'Create a task to prepare the proposal by Friday',
    selectedAgentId,
  }),
  signal: abortController.signal,
});

if (!response.ok) throw await response.json();

const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
let buffer = '';

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += value.replace(/\r\n/g, '\n');

  let boundary: number;
  while ((boundary = buffer.indexOf('\n\n')) >= 0) {
    const block = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const event = /^event: ?(.*)$/m.exec(block)?.[1] ?? 'message';
    const data = /^data: ?(.*)$/m.exec(block)?.[1];
    if (data === undefined) continue;
    const payload = JSON.parse(data);

    if (event === 'message_created') setSourceMessage(payload);
    if (event === 'activity') showTemporaryActivity(payload);
    if (event === 'text_delta') appendTemporaryText(payload.text);
    if (event === 'text_reset') clearTemporaryText();
    if (event === 'result') {
      replaceWithFinalReply(payload.reply);
      refreshConversationAndProposals();
    }
    if (event === 'error') showStreamError(payload);
  }
}
```

## Configuration

```ini
AI_AUTOMATION_ENABLED=true
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_SHARED_SECRET=<shared-secret>
AI_CHAT_STREAM_PATH=/api/v1/ai/chat
AI_CHAT_STREAM_TIMEOUT_MS=300000
```

`AI_CHAT_STREAM_PATH` defaults to the existing structured AI chat route. It
must point to the deployed AI endpoint that streams the existing
`AiChatTurnResponse` as its terminal `result` event.

## Test with curl

```bash
curl -N -X POST http://localhost:5000/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "startNewConversation": true,
    "clientMessageId": "f7021e38-5674-4a18-9580-10a843a1f876",
    "content": "Create a task to prepare the proposal by Friday"
  }'
```

Swagger UI waits for completion and is not suitable for observing live chunk
arrival. Use the frontend, `curl -N`, or another streaming HTTP client.
