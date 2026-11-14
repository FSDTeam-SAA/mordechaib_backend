# Business Memory

Laura's long-term business memory: important customers and their preferences,
what was discussed in meetings, what the owner promised, who is responsible
for what, company goals and financial targets, decisions and open items.

- **Main Backend is the only store** (`business_memories` collection).
- **Laura proposes, the owner decides.** Every memory Laura learns from a chat
  starts as `PENDING_REVIEW`. Only `ACTIVE` (approved or owner-written)
  memories are ever given back to an AI agent.
- A fact is stored once per organization. A memory the owner rejected is kept
  as `REJECTED`, so Laura does not propose the same fact again.

## 1. Memory object

```ts
type BusinessMemory = {
  id: string;
  kind:
    | 'CUSTOMER'          // who an important customer is
    | 'PREFERENCE'        // how a customer likes to work
    | 'MEETING'           // what was discussed or agreed in a meeting or call
    | 'COMMITMENT'        // something the owner promised
    | 'RESPONSIBILITY'    // what an employee is responsible for
    | 'GOAL'              // a company goal
    | 'FINANCIAL_TARGET'  // revenue, cost, margin targets
    | 'DECISION'          // a decision that was taken
    | 'OPEN_ITEM';        // something still outstanding
  status: 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';
  content: string;          // one self-contained sentence, max 1,000 chars
  contactIds: string[];     // customers it is about
  userIds: string[];        // team members it is about
  dueOn?: string;           // YYYY-MM-DD, for a commitment or open item
  source: {
    type: 'USER_MESSAGE' | 'MANUAL';
    messageId?: string;       // the organizer message it was learned from
    conversationId?: string;
  };
  proposedByAgent?: { id: string; name: string; type: string };
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

## 2. Owner and admin API (frontend)

Bearer token; roles `OWNER` and `ADMIN`. Responses use the standard
`{ success, data }` envelope.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/business-memory?status=PENDING_REVIEW` | Review queue: what Laura learned |
| `GET` | `/api/v1/business-memory?status=&kind=&contactId=&search=&page=&limit=` | Browse (archived memories are hidden unless `status=ARCHIVED`) |
| `POST` | `/api/v1/business-memory` | Add a memory - `ACTIVE` immediately |
| `PATCH` | `/api/v1/business-memory/:id` | Correct `kind`, `content`, `contactIds`, `userIds`, `dueOn` (does not change the status) |
| `POST` | `/api/v1/business-memory/:id/approve` | `PENDING_REVIEW` or `REJECTED` -> `ACTIVE` |
| `POST` | `/api/v1/business-memory/:id/reject` | `PENDING_REVIEW` or `ACTIVE` -> `REJECTED` |
| `DELETE` | `/api/v1/business-memory/:id` | Archive |

Create body:

```json
{
  "kind": "PREFERENCE",
  "content": "Kongkon prefers proposals by email before any call.",
  "contactIds": ["6af40fef9ff07abe4d79f244"],
  "dueOn": "2026-11-20"
}
```

`contactIds` must be active customers of the organization (`400` otherwise).
Writing a fact that already exists returns `409`.

Suggested UI: a "Laura learned" review list (approve / edit / reject, with a
link to the source conversation), and a memory page filtered by kind and
customer, where the owner can add goals and targets directly.

## 3. AI Backend contract

### 3.1 Proposing memories (chat turn response)

`POST /api/v1/ai/chat` may return an optional top-level `memories` array:

```json
{
  "schemaVersion": "1.0",
  "...": "...",
  "result": { "type": "MESSAGE" },
  "memories": [
    {
      "kind": "COMMITMENT",
      "content": "Send Kongkon the revised pricing by 2026-11-20.",
      "contactIds": ["6af40fef9ff07abe4d79f244"],
      "dueOn": "2026-11-20"
    }
  ]
}
```

Main Backend reads it leniently (`AiChatResponseValidator.memories`): at most
5 items; an item with an unknown kind, empty or over-long content, or a bad id
is dropped - never the turn. Unknown `contactIds` are removed. Valid items are
stored as `PENDING_REVIEW` with the source message, conversation and agent. A
storage failure is logged and never fails the chat turn. The `memories` field
is not forwarded to the frontend in the SSE `result` event.

### 3.2 Recall (AI-internal, read-only)

```http
GET /api/v1/ai-internal/organizations/{organizationId}/business-memory
    ?requesterUserId={userId}&contactIds={id,id}&search={text}&limit=20
x-ai-actions-secret: <shared-service-secret>
```

Returns only `ACTIVE` memories, most relevant first:

1. memories about the given customers;
2. text matches for `search` (usually the organizer's message);
3. the five newest `GOAL` and `FINANCIAL_TARGET` memories (company context).

```json
{
  "organizationId": "6a7d637faaab59e0624cde06",
  "items": [
    {
      "id": "6b0...",
      "kind": "PREFERENCE",
      "content": "Kongkon prefers proposals by email before any call.",
      "contactIds": ["6af40fef9ff07abe4d79f244"],
      "userIds": [],
      "updatedAt": "2026-11-14T06:00:00.000Z"
    }
  ]
}
```

The requester must be an active user of the organization (`404` otherwise).
