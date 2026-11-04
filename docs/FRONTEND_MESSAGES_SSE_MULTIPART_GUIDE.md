# Frontend Messages SSE and Multipart Guide

## Goal

Use one Main Backend route for the complete Chief of Staff message flow:

```http
POST /api/v1/messages
```

The same request:

1. creates or reuses a conversation;
2. persists the organizer's message and private attachments;
3. streams AI progress and answer text;
4. persists the final AI reply;
5. persists any clarification, task, meeting, or CRM proposal.

Frontend must not call a second AI route for the same message.

## Request modes

### Text-only SSE request

Use JSON when the message has no files:

```http
POST /api/v1/messages
Authorization: Bearer <access-token>
Accept: text/event-stream
Content-Type: application/json
```

```json
{
  "startNewConversation": true,
  "clientMessageId": "550e8400-e29b-41d4-a716-446655440000",
  "content": "Create a task to prepare the proposal by Friday",
  "selectedAgentId": "6aa51d1f9e98784ad5265250"
}
```

### SSE request with files

Use `FormData` when files are attached:

```http
POST /api/v1/messages
Authorization: Bearer <access-token>
Accept: text/event-stream
Content-Type: multipart/form-data; boundary=<generated-by-browser>
```

Do not set `Content-Type` in frontend code. The browser must generate the
multipart boundary.

| Form field             | Required    | Description                                                              |
| ---------------------- | ----------- | ------------------------------------------------------------------------ |
| `startNewConversation` | Yes         | String `"true"` for a new chat; `"false"` for an existing chat           |
| `conversationId`       | Conditional | Required when `startNewConversation=false`; omit for a new chat          |
| `clientMessageId`      | Recommended | A client-generated UUID used for idempotent retry                        |
| `content`              | Conditional | Optional only when at least one file is present                          |
| `selectedAgentId`      | No          | Active platform agent ID; omit to use the conversation/default selection |
| `files`                | No          | Repeat this field once per file                                          |

AI file-analysis limits:

- maximum 5 files;
- maximum 20 MB combined;
- PDF and DOCX;
- PNG, JPEG, WEBP, and GIF.

## Conversation rules

First message of a new chat:

```ts
startNewConversation: true;
conversationId: omitted;
```

Later message in the same chat:

```ts
startNewConversation: false;
conversationId: '<id from message_created or conversation response>';
```

Do not send `conversationId` with `startNewConversation=true`.

## Recommended TypeScript client

```ts
type SendMessageInput = {
  accessToken: string;
  apiUrl: string;
  startNewConversation: boolean;
  conversationId?: string;
  clientMessageId: string;
  content?: string;
  selectedAgentId?: string;
  files?: File[];
  signal?: AbortSignal;
};

type StreamHandlers = {
  onMessageCreated?: (message: unknown) => void;
  onActivity?: (activity: unknown) => void;
  onTextDelta?: (text: string) => void;
  onTextReset?: () => void;
  onResult?: (result: unknown) => void;
};

export async function sendMessageStream(
  input: SendMessageInput,
  handlers: StreamHandlers,
) {
  const files = input.files ?? [];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: 'text/event-stream',
  };

  let body: BodyInit;
  if (files.length > 0) {
    const form = new FormData();
    form.append('startNewConversation', String(input.startNewConversation));
    form.append('clientMessageId', input.clientMessageId);
    if (input.conversationId) {
      form.append('conversationId', input.conversationId);
    }
    if (input.content?.trim()) form.append('content', input.content.trim());
    if (input.selectedAgentId) {
      form.append('selectedAgentId', input.selectedAgentId);
    }
    for (const file of files) form.append('files', file);
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      startNewConversation: input.startNewConversation,
      clientMessageId: input.clientMessageId,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.content?.trim() ? { content: input.content.trim() } : {}),
      ...(input.selectedAgentId
        ? { selectedAgentId: input.selectedAgentId }
        : {}),
    });
  }

  const response = await fetch(`${input.apiUrl}/api/v1/messages`, {
    method: 'POST',
    headers,
    body,
    signal: input.signal,
  });

  if (!response.ok) {
    throw await readHttpError(response);
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('Expected an SSE response from the messages API');
  }
  if (!response.body) throw new Error('Message stream has no response body');

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, '\n');

    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseBlock(block);
      if (!parsed) continue; // Includes : ping comments.

      switch (parsed.event) {
        case 'message_created':
          handlers.onMessageCreated?.(parsed.data);
          break;
        case 'activity':
          handlers.onActivity?.(parsed.data);
          break;
        case 'text_delta':
          handlers.onTextDelta?.(
            String((parsed.data as { text?: unknown }).text ?? ''),
          );
          break;
        case 'text_reset':
          handlers.onTextReset?.();
          break;
        case 'result':
          handlers.onResult?.(parsed.data);
          return parsed.data;
        case 'error':
          throw parsed.data;
      }
    }
  }

  throw new Error('Message stream ended without a result or error event');
}

function parseSseBlock(block: string) {
  const event = /^event: ?(.*)$/m.exec(block)?.[1] ?? 'message';
  const dataLines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  if (dataLines.length === 0) return null;
  return { event, data: JSON.parse(dataLines.join('\n')) as unknown };
}

async function readHttpError(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  return {
    statusCode: response.status,
    message: await response.text(),
  };
}
```

`EventSource` cannot be used because this is an authenticated `POST` request
with a body. Use streaming `fetch` as shown above.

## SSE events

### `message_created`

Emitted by Main Backend after the source message and attachments are persisted:

```text
event: message_created
data: {"id":"...","conversationId":"...","processingStatus":"PROCESSING"}
```

Use this event to store the authoritative source message and the new
`conversationId`.

### `activity`

Temporary progress information. Display it but do not add it to permanent chat
history.

### `text_delta`

Append `data.text` to the temporary assistant text currently displayed.

### `text_reset`

Clear temporary assistant text. The previous deltas were a preamble, not the
final answer.

### `result`

The terminal success event. Main Backend emits it only after validating and
persisting the AI reply and any clarification/task/meeting/CRM proposal.

When it arrives:

1. replace temporary text with `result.reply.content`;
2. clear temporary activity state;
3. refresh conversation messages if needed;
4. refresh the relevant proposal list/details when `result.result.type` is not
   `MESSAGE`.

### `error`

The terminal stream failure. Display a retry action and stop the loading state.

### `: ping`

SSE keep-alive comment. It contains no JSON and must be ignored.

## UI state model

Recommended state for one active turn:

```ts
type ActiveTurn = {
  clientMessageId: string;
  sourceMessageId?: string;
  conversationId?: string;
  activities: unknown[];
  temporaryText: string;
  status: 'SENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
};
```

Only one active request should own a composer submission. Disable duplicate
submit while it is active, or reuse the same `clientMessageId` for a retry.

## Validation before upload

Validate in the browser for fast feedback, but treat backend validation as
authoritative:

```ts
const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function validateFiles(files: File[]) {
  if (files.length > MAX_FILES) throw new Error('Maximum 5 files');
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
    throw new Error('Files must be 20 MB or less in total');
  }
  if (files.some((file) => !ALLOWED_TYPES.has(file.type))) {
    throw new Error('Unsupported file type');
  }
}
```

## Errors

Before the stream starts, validation/authentication/provider errors use the
normal Main Backend JSON error response. Common cases include:

- `400`: invalid conversation fields, unsupported file, or too many files;
- `401`: missing or expired access token;
- `403`: insufficient organization role/access;
- `413`: attachments exceed the 20 MB combined AI limit;
- `429`: message rate limit reached;
- `502/503/504`: AI service unavailable or timed out.

After SSE headers start, failures arrive as an `error` event.

## Retry and cancellation

- Generate one UUID before the first submission and retain it until the turn
  succeeds or the user abandons it.
- Retry with the same `clientMessageId` to avoid creating a duplicate source
  message.
- For an attachment turn, include the same files again on retry so AI Backend
  receives their raw bytes for that retry.
- Pass an `AbortSignal` to cancel when the user clicks Stop or leaves the view.
- A cancelled/incomplete turn must be shown as incomplete, never as successful.

## Optional non-streaming fallback

Legacy polling clients may send `Accept: application/json`. Main Backend then
returns a `201` message acknowledgement and processes AI through the existing
queue. New Chief of Staff UI should use `Accept: text/event-stream`.

## Manual test

```bash
curl -N -X POST http://localhost:5000/api/v1/messages \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Accept: text/event-stream" \
  -F "startNewConversation=true" \
  -F "clientMessageId=550e8400-e29b-41d4-a716-446655440000" \
  -F "content=Review this document" \
  -F "files=@C:/Users/User/Downloads/document.pdf"
```

Swagger UI may wait until the request completes and display the events at once.
Use the application, streaming `fetch`, or `curl -N` to verify real-time event
arrival.
