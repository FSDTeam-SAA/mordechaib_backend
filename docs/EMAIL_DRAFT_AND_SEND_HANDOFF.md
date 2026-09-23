# Owner email draft and send handoff

This main-backend feature stores a draft in the platform and sends it only after the authenticated owner explicitly invokes Send. It supports the owner's connected Google (Gmail) or Microsoft (Outlook) account. It does not auto-send an AI reply and does not require CRM data.

## Setup

- Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_TENANT`, and `INTEGRATION_ENCRYPTION_KEY` (at least 32 characters). Existing calendar/meeting connections do not grant email permission.
- Register the exact Google redirect URI from `GOOGLE_EMAIL_OAUTH_REDIRECT_URI` (default: `${APP_BASE_URL}/api/v1/email/connections/GOOGLE/callback`) and the exact Microsoft redirect URI from `MICROSOFT_EMAIL_OAUTH_REDIRECT_URI` (default: `${APP_BASE_URL}/api/v1/email/connections/OUTLOOK/callback`). `MEETING_INTEGRATIONS_FRONTEND_URL` controls the page the OAuth callback redirects to.
- Enable Gmail API and allow `https://www.googleapis.com/auth/gmail.send` for the Google OAuth app. Configure Microsoft Graph delegated `Mail.Send` (and `User.Read`), plus `offline_access`; tenant/admin consent policy may require administrator approval. Each owner must connect and consent individually.
- Keep `INTEGRATION_ENCRYPTION_KEY` stable across deployments. Changing it makes existing encrypted connections unreadable.

## Owner-facing API

All paths below use the default `/api/v1` prefix; all except the provider callback require the owner JWT and organization context.

| Action                    | Endpoint                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| See account connections   | `GET /email/connections`                                                                                                                                    |
| Start provider consent    | `GET /email/connections/GOOGLE/connect` or `/OUTLOOK/connect`; open returned `authorizationUrl`                                                             |
| Disconnect                | `DELETE /email/connections/GOOGLE` or `/OUTLOOK`                                                                                                            |
| Save platform draft       | `POST /email/drafts` with `{ "to": ["person@example.com"], "subject": "Quotation", "body": "...", "provider": "GOOGLE", "clientDraftId": "optional-uuid" }` |
| List or view drafts       | `GET /email/drafts`, `GET /email/drafts/:id`                                                                                                                |
| Edit unsent draft         | `PATCH /email/drafts/:id` with any of `to`, `subject`, `body`, `provider`                                                                                   |
| Send after explicit click | `POST /email/drafts/:id/send` with `{ "revision": 1, "provider": "GOOGLE" }`                                                                                |

`provider` is optional while composing; the owner can select it on Send. The UI must display the saved `to`, `subject`, and `body` for review, and submit the latest `revision`. An edited draft increments its revision. A stale revision is rejected. The backend never sends from a different provider than one already chosen on the draft.

Statuses: `DRAFT`, `SENDING`, `SENT`, `FAILED`, `UNKNOWN`. `SENT` means Gmail returned a message ID or Microsoft Graph accepted the send request; it does not guarantee recipient delivery. `UNKNOWN` (for example, network timeout after submission) must be reconciled against the provider's Sent Items before any new send is attempted. The backend deliberately blocks automatic retry in that state to reduce duplicate emails. There is no provider mailbox-draft synchronization: drafts live in this platform until Send.

## AI backend contract

The main backend accepts an optional structured `emailDraft` inside the existing `assistantMessage` on a `USER_MESSAGE` result:

```json
{
  "assistantMessage": {
    "responseId": "existing-response-id",
    "content": "I prepared an email draft for your review.",
    "agent": { "id": "existing-agent-id", "name": "Laura", "type": "..." },
    "emailDraft": {
      "to": ["person@example.com"],
      "subject": "Project quotation",
      "body": "Hello, ..."
    }
  }
}
```

The other required assistant-message fields remain as defined in the existing AI contract. When present for an active owner, the main backend saves one platform draft per AI `responseId` and includes `emailDraftId` on the chat message. The UI can fetch that draft by ID and show Review/Edit/Send. The AI backend must emit this structured field for automatic draft creation; plain chat prose is not parsed as an email. The AI backend and frontend are separate workspaces and are not changed by this implementation.

Only explicit owner Send calls the provider. Tokens are encrypted at rest and scoped to that owner. A send-request audit is recorded before contacting the provider, and concurrent Send calls cannot claim the same draft.
