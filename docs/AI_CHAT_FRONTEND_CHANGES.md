# Ask Laura: Frontend Implementation Guide

How to implement the Ask Laura chat against Main Backend: send a message,
stream the answer, handle every response and error, show proposals, and build
the new business memory review page. It covers what changed and gives
ready-to-use TypeScript.

The frontend only ever calls **Main Backend** (`/api/v1/...`) with the user's
Bearer token. It never calls the AI Backend directly.

Related: [FRONTEND_MESSAGES_SSE_MULTIPART_GUIDE.md](FRONTEND_MESSAGES_SSE_MULTIPART_GUIDE.md)
(the base streaming guide) and [BUSINESS_MEMORY.md](BUSINESS_MEMORY.md).

A working reference implementation of everything below is in
`tools/ai-chat-tester.html`: open it in a browser, log in and chat.

---

## 1. What changed for the frontend

| Change | What to do |
|---|---|
| `result.reply.content` (and saved AI message `content`) is now **HTML** | Render it as sanitized HTML (section 5); strip tags for previews |
| `text_delta` now streams **live**, while Laura is still writing | Show it as a plain-text preview; replace it with the HTML when `result` arrives |
| `text_reset` can arrive mid-stream | Clear the preview text |
| Questions can offer choices: free time slots, "Did you mean kongkon?", Zoom / Google Meet | Show `options` as buttons (section 6.2) |
| Task and meeting proposals can carry `customerId` | Show the linked customer if you want; the payload is otherwise the same |
| New **business memory** review page | New screens and endpoints (section 9) |
| New error codes | Map them to friendly messages (section 8) |

Nothing changed in the request: `POST /api/v1/messages` takes the same fields.

---

## 2. The flow of one message

```text
Frontend                       Main Backend                         AI
   | POST /api/v1/messages  ->  |
   |                            | save user message
   | <- event: message_created  |
   |                            | -> POST /api/v1/ai/chat
   | <- event: activity         | <- activity          ("Checking your CRM and calendar")
   | <- event: text_delta  x N  | <- text_delta        (plain-text preview, live)
   | <- event: text_reset ?     | <- text_reset        (clear the preview)
   |                            | <- result            (validate + save reply/proposal)
   | <- event: result           |
   | stream closes              |
```

- **Exactly one** terminal event: `result` or `error`. Then the stream closes.
- `activity`, `text_delta` and `text_reset` are temporary. They are never saved.
- `result` is sent only **after** Main Backend has saved the reply and any
  proposal, so a refresh right after it shows the saved records.

---

## 3. Sending a message

`POST /api/v1/messages`, with `Authorization: Bearer <accessToken>` and
`Accept: text/event-stream`.

| Field | Type | Notes |
|---|---|---|
| `startNewConversation` | boolean | `true` for a new chat |
| `conversationId` | string | Required when `startNewConversation` is `false` |
| `clientMessageId` | string (UUID) | `crypto.randomUUID()`. Lets a retried request be recognized as the same message |
| `content` | string | Optional only when files are attached |
| `selectedAgentId` | string | Optional; defaults to Laura |
| `files` | File[] | Multipart only, repeated `files` parts |

Without files, send JSON. With files, send `FormData`, and **do not set
`Content-Type`**: the browser adds the multipart boundary.

Check uploads before sending, so the user gets an instant message:

```ts
const ALLOWED = ['application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024; // combined

export function checkFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `You can attach up to ${MAX_FILES} files.`;
  if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return 'Files are larger than 20 MB in total.';
  const bad = files.find((f) => !ALLOWED.includes(f.type));
  return bad ? `${bad.name} is not a PDF, Word document or image.` : null;
}
```

The server still checks every file (type from the bytes, damaged files, size),
so treat this as a convenience only.

---

## 4. The streaming client

`EventSource` cannot send a `POST` with a token, so use `fetch` and read the
body stream.

```ts
// laura-chat.ts
export type AgentIdentity = { id: string; name: string; type: string; imageUrl?: string };

export type ClarificationQuestion = {
  id: string;               // opaque - may look like "meeting-start-time--on-2026-11-16"; never parse it
  field: string;            // e.g. startsAt, invitees, platform, customer, dueDate
  question: string;
  inputType: 'text' | 'choice' | 'email' | 'datetime' | 'number';
  required: boolean;
  options?: { label: string; value: string }[];
};

export type ChatResult =
  | { type: 'MESSAGE' }
  | { type: 'CLARIFICATION'; draft: { id: string; kind: 'TASK' | 'MEETING' | 'CRM_RECORD_UPDATE'; payload: Record<string, unknown> };
      questions: ClarificationQuestion[] }
  | { type: 'TASK_PROPOSAL'; draftId: string; proposal: TaskProposal }
  | { type: 'MEETING_PROPOSAL'; draftId: string; proposal: MeetingProposal }
  | { type: 'CRM_RECORD_UPDATE_PROPOSAL'; draftId: string; proposal: CrmUpdateProposal };

export type TaskProposal = {
  title: string; description?: string; department?: string; priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: string; estimatedDurationMinutes?: number; tags?: string[]; customerId?: string;
};
export type MeetingProposal = {
  platform: 'ZOOM' | 'GOOGLE_MEET'; title: string; agenda?: string; startsAt: string; // UTC ISO instant
  durationMinutes?: number; timezone: string; invitees?: string[]; customerId?: string;
};
export type CrmUpdateProposal = {
  provider: 'HUBSPOT' | 'SALESFORCE'; objectType: string; externalId: string;
  properties: Record<string, unknown>; expectedProviderUpdatedAt?: string;
};

export type ChatTurnResponse = {
  schemaVersion: '1.0'; turnId: string; conversationId: string; inReplyToMessageId: string;
  reply: { id: string; content: string /* HTML */; agent: AgentIdentity };
  result: ChatResult;
};

export type Activity = { stage: string; agent: string; agent_display_name?: string; message: string; tool?: string; success?: boolean };

export type StreamHandlers = {
  onMessageCreated?: (message: { id: string; conversationId: string; processingStatus: string }) => void;
  onActivity?: (activity: Activity) => void;
  onTextDelta?: (text: string) => void;
  onTextReset?: () => void;
};

/** A failure the UI can show. `retryable` says whether "Try again" makes sense. */
export class ChatError extends Error {
  constructor(message: string, readonly status: number | null, readonly code: string | null, readonly retryable: boolean) {
    super(message);
  }
}

export type SendInput = {
  apiUrl: string; token: string;
  conversationId?: string; content?: string; files?: File[]; selectedAgentId?: string;
  signal?: AbortSignal;
};

export async function sendMessage(input: SendInput, handlers: StreamHandlers = {}): Promise<ChatTurnResponse> {
  const fields: Record<string, string | boolean> = {
    startNewConversation: !input.conversationId,
    clientMessageId: crypto.randomUUID(),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.content ? { content: input.content } : {}),
    ...(input.selectedAgentId ? { selectedAgentId: input.selectedAgentId } : {}),
  };
  const headers: Record<string, string> = { Authorization: `Bearer ${input.token}`, Accept: 'text/event-stream' };
  let body: BodyInit;
  if (input.files?.length) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    for (const file of input.files) form.append('files', file);
    body = form; // no Content-Type header: the browser sets the boundary
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(fields);
  }

  const response = await fetch(`${input.apiUrl}/api/v1/messages`, { method: 'POST', headers, body, signal: input.signal });

  // Errors before the stream starts are normal JSON responses.
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw await httpError(response);
  }

  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value.replace(/\r\n/g, '\n');
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = parseBlock(block);
      if (!event) continue; // ": ping" keep-alives
      switch (event.name) {
        case 'message_created': handlers.onMessageCreated?.(event.data as never); break;
        case 'activity': handlers.onActivity?.(event.data as Activity); break;
        case 'text_delta': handlers.onTextDelta?.(String((event.data as { text?: string }).text ?? '')); break;
        case 'text_reset': handlers.onTextReset?.(); break;
        case 'result': return event.data as ChatTurnResponse;
        case 'error': {
          // From Laura: { code, message, retryable, detail }. From Main Backend when the
          // connection to Laura breaks: { status: 502, detail }.
          const e = event.data as { code?: string; message?: string; detail?: string; retryable?: boolean; status?: number };
          throw new ChatError(e.message || e.detail || 'Laura could not answer.', e.status ?? null, e.code ?? null, e.retryable ?? true);
        }
      }
    }
    if (done) break;
  }
  throw new ChatError('The connection closed before Laura finished.', null, null, true);
}

function parseBlock(block: string): { name: string; data: unknown } | null {
  let name = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (!data.length) return null;
  try { return { name, data: JSON.parse(data.join('\n')) }; } catch { return { name, data: data.join('\n') }; }
}

async function httpError(response: Response): Promise<ChatError> {
  let body: { message?: string | string[]; code?: string; retryable?: boolean } = {};
  try { body = await response.json(); } catch { /* not JSON */ }
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  return new ChatError(message || response.statusText || 'Request failed', response.status, body.code ?? null,
    body.retryable ?? [408, 429, 500, 502, 503, 504].includes(response.status));
}
```

### 4.1 A React hook around it

```tsx
// useLauraChat.ts
import { useCallback, useRef, useState } from 'react';
import { ChatError, ChatTurnResponse, sendMessage } from './laura-chat';

type Phase = 'idle' | 'sending' | 'streaming' | 'error';

export function useLauraChat(apiUrl: string, token: string) {
  const [conversationId, setConversationId] = useState<string>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [activity, setActivity] = useState<string>('');     // "Checking your CRM and calendar"
  const [preview, setPreview] = useState<string>('');       // live plain-text answer
  const [last, setLast] = useState<ChatTurnResponse>();     // authoritative result
  const [error, setError] = useState<ChatError>();
  const abort = useRef<AbortController>();

  const send = useCallback(async (content: string, files: File[] = []) => {
    abort.current = new AbortController();
    setPhase('sending'); setPreview(''); setActivity(''); setError(undefined);
    try {
      const result = await sendMessage(
        { apiUrl, token, conversationId, content, files, signal: abort.current.signal },
        {
          onMessageCreated: (m) => { setConversationId(m.conversationId); setPhase('streaming'); /* add m to the list */ },
          onActivity: (a) => setActivity(a.message),
          onTextDelta: (t) => setPreview((p) => p + t),
          onTextReset: () => setPreview(''),
        },
      );
      setLast(result);
      setPreview('');            // the saved HTML reply replaces the preview
      setPhase('idle');
      // Refresh the conversation (and proposals when result.type !== 'MESSAGE').
      return result;
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setPhase('idle'); return; }
      setError(e instanceof ChatError ? e : new ChatError(String(e), null, null, true));
      setPhase('error');
    }
  }, [apiUrl, token, conversationId]);

  const stop = useCallback(() => abort.current?.abort(), []);
  return { conversationId, setConversationId, phase, activity, preview, last, error, send, stop };
}
```

UI states:

| Phase | Show |
|---|---|
| `sending` | The user's bubble, and a "Laura is thinking" indicator |
| `streaming` | `activity` as a small status line, and `preview` as plain text in a temporary Laura bubble |
| `idle` after `result` | The saved Laura message, rendered from HTML (section 5) |
| `error` | The error message, with "Try again" only when `error.retryable` |

Stopping (`stop()`) cancels Laura's work on the server too. The user's
message is already saved, so on "Try again" send the same text as a new message.

---

## 5. Rendering Laura's reply (HTML)

`reply.content` (in `result`) and the `content` of saved AI messages are small
HTML fragments:

```html
<p>To prepare the meeting proposal, I need a few details:</p>
<ul><li>On November 16, 2026 you're free at 10:00 AM (UTC). Which time should the meeting start?</li>
<li>Should the meeting be on Zoom or Google Meet?</li></ul>
```

- Only `p`, `br`, `ul`, `ol`, `li` and `strong` are used, with no attributes.
  All text inside is escaped by the server.
- Still sanitize on the client (defense in depth), using the same allow-list:

```tsx
import DOMPurify from 'dompurify';

const LAURA_HTML = { ALLOWED_TAGS: ['p', 'br', 'ul', 'ol', 'li', 'strong'], ALLOWED_ATTR: [] };
const isHtml = (s: string) => /<\/?(p|br|ul|ol|li|strong)\b/i.test(s);

export function LauraText({ content }: { content: string }) {
  if (!isHtml(content)) return <p style={{ whiteSpace: 'pre-wrap' }}>{content}</p>; // older plain-text messages
  return <div className="laura-text" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, LAURA_HTML) }} />;
}

/** One-line previews (sidebar, notifications): never show tags. */
export const plainPreview = (content: string, max = 80) =>
  new DOMParser().parseFromString(content, 'text/html').body.textContent!.replace(/\s+/g, ' ').trim().slice(0, max);
```

```css
.laura-text p { margin: 0 0 6px; }
.laura-text ul, .laura-text ol { margin: 0 0 6px; padding-left: 20px; }
.laura-text > :last-child { margin-bottom: 0; }
```

- **During streaming**, show `preview` as plain text (`white-space: pre-wrap`).
- **When `result` arrives**, render `result.reply.content` with `LauraText`.
- Messages saved before this change are plain text; `LauraText` handles both.

---

## 6. Handling each result type

`result.result.type` says what Laura did. The reply text always explains it in
words, so `LauraText` alone is already correct. Add the extras below.

### 6.1 `MESSAGE`

A plain answer (questions, advice, a customer list, the schedule, a summary).
Nothing else is needed.

### 6.2 `CLARIFICATION`: Laura needs details

```json
{
  "type": "CLARIFICATION",
  "draft": { "id": "chat-draft-meeting-6af8...", "kind": "MEETING", "payload": { "title": "Meeting with Monir Hossain", "timezone": "Asia/Dhaka" } },
  "questions": [
    { "id": "meeting-start-time--on-2026-11-16", "field": "startsAt", "inputType": "choice",
      "question": "On November 16, 2026 you're free at 10:00 AM and 3:00 PM (Asia/Dhaka). Which time should the meeting start?",
      "options": [{ "label": "10:00 AM–10:30 AM", "value": "2026-11-16 10:00" }, { "label": "3:00 PM–3:30 PM", "value": "2026-11-16 15:00" }] },
    { "id": "meeting-platform", "field": "platform", "inputType": "choice", "question": "Should the meeting be on Zoom or Google Meet?",
      "options": [{ "label": "Zoom", "value": "ZOOM" }, { "label": "Google Meet", "value": "GOOGLE_MEET" }] },
    { "id": "invitee-crm-kokon", "field": "invitees", "inputType": "choice",
      "question": "I couldn't find Kokon in your CRM. Did you mean kongkon (kongkon@gmail.com)? If not, what email address should be used to invite them?",
      "options": [{ "label": "Yes, invite kongkon", "value": "kongkon@gmail.com" }, { "label": "No, someone else", "value": "NONE" }] }
  ]
}
```

- The questions are already in the reply text. Optionally, show each
  question's `options` as **quick-reply buttons** under Laura's message.
- **A button sends a normal chat message** with the option's **label**, for
  example `Yes, invite kongkon`, `3:00 PM–3:30 PM` or `Google Meet`. There is
  no separate answer endpoint: Laura reads the next message together with the
  pending draft. The user can always type instead, including several answers
  at once ("3 pm on Google Meet, yes that's him").
- `inputType` `datetime`, `email` or `text` without options: just let the user
  type.
- **Never parse or change question `id`s.** They are opaque, and some hold
  state (`--on-2026-11-16` remembers the date).
- The user can ask something else in between ("show me my schedule"). Laura
  answers it and keeps the draft; there is no need to block the input.

### 6.3 `TASK_PROPOSAL` / `MEETING_PROPOSAL` / `CRM_RECORD_UPDATE_PROPOSAL`

The proposal is saved and **waiting for approval**. Nothing has been created
yet, and Laura says so ("ready for review"). Show a card with the details and
Approve / Reject buttons.

Times are UTC instants. Display them in the proposal's timezone (meetings) or
the user's timezone (tasks):

```ts
export const showTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
// showTime('2026-11-16T09:00:00.000Z', 'Asia/Dhaka') -> "Nov 16, 2026, 3:00 PM"
```

To act on it, load the saved proposal (it has the id you approve with):

```ts
// The proposal created from a message: sourceId = the message_created id.
const res = await fetch(`${apiUrl}/api/v1/ai-actions/proposals?sourceId=${userMessageId}`, { headers: { Authorization: `Bearer ${token}` } });
const proposal = (await res.json()).data.items[0];
// proposal: { id, status, actionType: 'CREATE_TASK' | 'SCHEDULE_MEETING' | 'UPDATE_CRM_RECORD', payload, clarificationQuestions, chatDraftId, revision }

// Approve (executes it) or reject:
await fetch(`${apiUrl}/api/v1/ai-actions/proposals/${proposal.id}/action`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'APPROVE' }), // or { action: 'REJECT', reason: '...' }
});
```

- Proposal `status`: `NEEDS_CLARIFICATION` (Laura is still asking), `PENDING`
  (ready to approve), `APPROVED` -> `EXECUTING` -> `EXECUTED` or `FAILED`
  (offer `{ action: 'RETRY' }`), or `REJECTED`.
- One draft keeps the **same** proposal while the conversation continues; its
  `revision` increases. Refresh the card after each `result` for that draft.
- Approving a CRM update **changes the record in HubSpot or Salesforce**.
  Ask for confirmation first.

---

## 7. Optional: the non-streaming mode

Without `Accept: text/event-stream`, `POST /api/v1/messages` returns `201` at
once (`processingStatus: "PENDING"`), and Laura answers in the background.
Poll `GET /api/v1/messages?conversationId=…` every 2 s until the message's
`processingStatus` is `COMPLETED` or `FAILED`. The AI reply is the message
with `senderType: "AI"` and `sourceMessageId` equal to your message id. Prefer
streaming; use this only where streaming is not possible.

---

## 8. Errors

**Before the stream** (normal HTTP error with JSON body `{ statusCode, message }`
or `{ code, message, retryable }`):

| Status | Meaning | Show | Retry? |
|---|---|---|---|
| 400 | Invalid request (for example empty message) | The message from the server | no |
| 401 | Session expired | Log in again | no |
| 403 / 404 | No access to that conversation | "This conversation is not available" | no |
| 413 | Too many or too large files, or an image too large | "Files are too large (max 5 files, 20 MB)" | no |
| 415 | Unsupported file type | "Only PDF, Word documents and images" | no |
| 422 | A file is damaged or password-protected | The message from the server (it names the file) | no |
| 502 / 503 / 504 | Laura is unavailable or timed out | "Laura is unavailable right now" | yes |

**After the stream started**, one `error` event: `{ code, message, retryable }`
from Laura, or `{ status: 502, detail }` when Main Backend lost the connection
to Laura (retryable):

| `code` | Show | Retry? |
|---|---|---|
| `MODEL_UNAVAILABLE`, `CHAT_TIMEOUT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `IDEMPOTENCY_UNAVAILABLE` | "Laura is busy, please try again" | yes |
| `MODEL_REJECTED_REQUEST` | "Laura couldn't read this message or one of its files" | no: change the message or file |
| `CHAT_RESULT_INVALID`, `CHAT_RESULT_UNAVAILABLE` | "Laura couldn't prepare an answer" | yes, after rephrasing |

The user's message stays saved with `processingStatus: "FAILED"`. Retry by
sending the text again.

---

## 9. New: business memory page

Laura now learns long-term business facts from chats: customers, preferences,
meeting outcomes, promises, who is responsible for what, goals, financial
targets, decisions and open items. **The owner must approve each one before
Laura uses it.** Only `OWNER` and `ADMIN` can use these endpoints.

| Method | Path | Use |
|---|---|---|
| `GET` | `/api/v1/business-memory?status=PENDING_REVIEW` | "Laura learned" review queue |
| `GET` | `/api/v1/business-memory?status=ACTIVE&kind=&contactId=&search=&page=&limit=` | Memory list (filters optional) |
| `POST` | `/api/v1/business-memory` | Owner adds a memory (active at once) |
| `PATCH` | `/api/v1/business-memory/:id` | Edit `kind`, `content`, `contactIds`, `dueOn` |
| `POST` | `/api/v1/business-memory/:id/approve` | Approve |
| `POST` | `/api/v1/business-memory/:id/reject` | Reject (it will not be proposed again) |
| `DELETE` | `/api/v1/business-memory/:id` | Archive |

```ts
type BusinessMemory = {
  id: string;
  kind: 'CUSTOMER' | 'PREFERENCE' | 'MEETING' | 'COMMITMENT' | 'RESPONSIBILITY' | 'GOAL' | 'FINANCIAL_TARGET' | 'DECISION' | 'OPEN_ITEM';
  status: 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';
  content: string;          // plain text, one sentence
  contactIds: string[];     // customers it is about
  dueOn?: string;           // YYYY-MM-DD
  source: { type: 'USER_MESSAGE' | 'MANUAL'; messageId?: string; conversationId?: string };
  proposedByAgent?: { id: string; name: string; type: string };
  createdAt: string; updatedAt: string;
};

const memoryApi = (apiUrl: string, token: string) => {
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${apiUrl}/api/v1/business-memory${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
    const body = await res.json();
    if (!res.ok) throw new Error([].concat(body.message ?? res.statusText).join('; '));
    return body.data;
  };
  return {
    list: (status = 'PENDING_REVIEW', page = 1) => call(`?status=${status}&page=${page}&limit=20`) as Promise<{ items: BusinessMemory[]; pagination: { total: number; pages: number } }>,
    add: (kind: BusinessMemory['kind'], content: string, dueOn?: string) => call('', { method: 'POST', body: JSON.stringify({ kind, content, ...(dueOn ? { dueOn } : {}) }) }),
    edit: (id: string, changes: Partial<Pick<BusinessMemory, 'kind' | 'content' | 'contactIds' | 'dueOn'>>) => call(`/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
    approve: (id: string) => call(`/${id}/approve`, { method: 'POST' }),
    reject: (id: string) => call(`/${id}/reject`, { method: 'POST' }),
    archive: (id: string) => call(`/${id}`, { method: 'DELETE' }),
  };
};
```

Suggested screens:

1. **"Laura learned" (review queue)**: cards showing kind, content and date,
   a link to the source conversation (`source.conversationId`), and Approve /
   Edit / Reject. Show a badge with the pending count (`pagination.total`).
2. **Memory**: tabs or filters by kind (Customers, Promises, Goals & targets,
   Decisions, Open items), search, and "Add memory" for goals and targets the
   owner wants Laura to know.

Laura never says "I saved that" in chat. If you want to tell the user, refresh
the pending count after each chat `result`.

---

## 10. Timezones

Laura reads "tomorrow at 3 pm" in the **user's timezone** (or the organization's
if the user has none). A user left on UTC gets UTC times ("10:00 AM (UTC)").
Make sure the profile or organization settings let users set their timezone,
and show proposal times with `showTime` (section 6.3).

---

## 11. Checklist

- [ ] Stream with `fetch` and handle `message_created`, `activity`, `text_delta`, `text_reset`, `result` and `error`, ignoring `: ping`
- [ ] Show the plain-text preview while streaming, then the sanitized HTML `reply.content`
- [ ] Render saved AI messages with `LauraText`; strip tags for previews
- [ ] Show option buttons for questions; a tap sends the option label as a message
- [ ] Show proposal cards with Approve / Reject; refresh after each `result`
- [ ] Show the error messages from section 8; offer "Try again" only when retryable
- [ ] Build the business memory review page (owner/admin only)
- [ ] Display times in the right timezone
- [ ] Compare behaviour with `tools/ai-chat-tester.html`
