# Backend changes — AI chat unification and TypeScript 6 fixes

Date: 2026-11-13 · Base commit: `2bdc420` (main)

This folder holds a copy of every backend file that was changed, at the same
path it has in the repository:

```text
change-files/
├── tsconfig.json
└── src/modules/
    ├── ai-integration/
    │   ├── ai-chat-streaming.service.ts
    │   ├── ai-chat-streaming.service.spec.ts
    │   └── ai-streaming.client.spec.ts
    ├── billing/providers/stripe.provider.ts
    └── stripe/stripe.provider.ts
```

To apply them, copy each file over the file at the same path in the
repository. The changes are already in the working tree of this checkout;
nothing has been committed.

**Results after the changes**

| Check | Result |
|---|---|
| `tsc --noEmit` with TypeScript 5.9.3 (the project's version) | 0 errors |
| `tsc --noEmit` with TypeScript 6.0.3 (VS Code's built-in version) | 0 errors (was: config error, then 38 errors) |
| `nest build` | passes |
| `jest --runInBand` (full suite) | 119 suites, 482 tests pass |
| VS Code Problems panel | empty |

---

## 1. AI chat — one chat API with streaming and files

### Background

The AI Backend now has **one** chat API: `POST /api/v1/ai/chat`. It handles:

- live streaming (Server-Sent Events) or one JSON response;
- file uploads (multipart);
- real CRM, calendar and connected-CRM lookups;
- task, meeting and CRM-record-update proposals.

The old `POST /api/v1/chat` and `POST /api/v1/ai/chief-of-staff/reply` were
removed from the AI Backend.

This backend was already built for that flow. It sends the structured request
with `requester`, uses multipart when a message has files, reads the stream,
and validates `CRM_RECORD_UPDATE_PROPOSAL` and `customerId`. Only the
error-event handling needed a change.

### `src/modules/ai-integration/ai-chat-streaming.service.ts`

**What changed:** `errorDetail()`, which reads the reason from the stream's
terminal `error` event.

- **Before:** it read only `detail`.
- **After:** it reads `message`, which is the field in the AI chat contract
  (`{ code, message, retryable }`). If `message` is missing, it falls back to
  `detail`.

**Why:** with only `detail`, a failed turn was recorded with the generic text
"AI chat stream failed" instead of the real reason, for example "The chat model
is rate limited." The AI Backend now sends both fields, so either way works.

Prettier also re-wrapped the `this.config.get<string>('aiService.chatStreamPath', …)`
call onto one line. This is formatting only.

### `src/modules/ai-integration/ai-chat-streaming.service.spec.ts`

**Added test:** *"records the contract error message from a structured error
event"*. It sends `{"code":"RATE_LIMITED","message":"The chat model is rate
limited.","retryable":true}` and checks two things:

- the message is marked `FAILED` with that exact reason;
- the event is passed through to the client unchanged.

### `src/modules/ai-integration/ai-streaming.client.spec.ts`

**Changed:** the example path in the tests, from `/api/v1/chat` (removed) to
`/api/v1/ai/chat`. This is test data only.

---

## 2. TypeScript 6 compatibility (VS Code errors)

### Background

VS Code uses its own **TypeScript 6** to check files in the editor. The
project builds with **TypeScript 5.9.3**. TypeScript 6 changed two defaults,
which made the editor show errors even though the build and the tests passed:

1. **`types` defaults to empty.** Jest's globals were no longer picked up, so
   every `*.spec.ts` file showed *"Cannot find name 'describe'. Do you need to
   install type definitions for a test runner?"*.
2. **`baseUrl` is deprecated.** `tsconfig.json` showed *"Option 'baseUrl' is
   deprecated and will stop functioning in TypeScript 7.0"*. That error also
   stopped TypeScript before it checked any code.
3. **Inferred return types that reference package-internal types** (TS2883).
   Once the config error was fixed, TypeScript 6 reported 38 errors in the two
   Stripe providers, whose methods returned types it could not name.

### `tsconfig.json`

| Change | Why |
|---|---|
| Added `"types": ["node", "jest"]` | Loads Node and Jest globals explicitly, so `describe`, `it`, `expect` and `process` resolve in both TS 5.9 and TS 6. |
| Removed `"baseUrl": "./"` | Deprecated in TS 6, and it would stop working in TS 7. |
| `paths` values now start with `./` (e.g. `"@/*": ["./src/*"]`) | Without `baseUrl`, paths must be relative to `tsconfig.json`. The aliases resolve to the same folders as before. |

Nothing in `src/` imports these aliases (`@/…`, `@common/…`, `@modules/…`,
`@database/…`, `@config/…`), and no script loads `tsconfig-paths`. Removing
`baseUrl` therefore does not change how anything compiles or runs.

`tsconfig.build.json` extends this file and is unchanged.

### `src/modules/stripe/stripe.provider.ts` and `src/modules/billing/providers/stripe.provider.ts`

**What changed:** explicit return types on the methods TypeScript 6 flagged.
The method bodies are unchanged, so there is **no runtime change**. The types
are exactly what TypeScript already inferred.

| Method | Return type |
|---|---|
| `createCheckoutSession`, `createOneTimeCheckoutSession`, `createCheckoutSessionWithAddons` | `Promise<Stripe.Response<Stripe.Checkout.Session>>` |
| `cancelSubscription`, `cancelSubscriptionImmediately`, `pauseSubscription`, `resumeSubscription`, `upgradeSubscriptionPrice` | `Promise<Stripe.Response<Stripe.Subscription>>` |
| `constructWebhookEvent` | `Stripe.Event` |
| `createCallOverageInvoiceItem` | `Promise<Stripe.Response<Stripe.InvoiceItem>>` |
| `createProduct`, `updateProductName` | `Promise<Stripe.Response<Stripe.Product>>` |
| `createPrice`, `archivePrice` | `Promise<Stripe.Response<Stripe.Price>>` |
| `addSubscriptionItem`, `updateSubscriptionItem` | `Promise<Stripe.Response<Stripe.SubscriptionItem>>` |
| `deleteSubscriptionItem` | `Promise<Stripe.Response<Stripe.DeletedSubscriptionItem>>` |

`stripe/stripe.provider.ts` has all 17 methods. `billing/providers/stripe.provider.ts`
has three of them: `createCheckoutSession`, `cancelSubscription` and
`constructWebhookEvent`. The types come from the installed `stripe` package
(22.6.2).

---

## 3. Deployment notes

- **Main Backend env:** keep `AI_CHAT_STREAM_PATH=/api/v1/ai/chat` (the default),
  and remove any override that points at `/api/v1/chat`. That route no longer
  exists on the AI Backend.
- **Deploy order:** deploy the AI Backend first, then switch or confirm
  `AI_CHAT_STREAM_PATH`.
- **`customerId`:** the AI Backend sends `customerId` on task and meeting
  proposals only when its `CHAT_EMIT_CUSTOMER_ID=true`. This backend already
  accepts it, so it can be enabled once this backend version is deployed.
- **Frontend:** show `options` as buttons for every clarification question with
  `inputType: "choice"`. They now appear for customer confirmation, free time
  slots and calendar clashes, not only the meeting platform.
- **ESLint:** `pnpm lint` crashes while loading its config ("Identifier
  'createRequire' has already been declared"). It does the same on unchanged
  `main`, so it is an existing setup issue with the installed Node version
  (v26), not caused by these changes.
