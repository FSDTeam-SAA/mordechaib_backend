# Calendar and connected-meeting setup

This backend uses provider-managed calendars and Recall-managed meeting bots:

- Google Calendar API and Microsoft Graph create, update, and cancel calendar events.
- Google Calendar or Outlook Calendar can both remain connected for an organization.
- Exactly one connected calendar is selected as the organization default.
- Google Meet or Zoom creates the meeting URL.
- Recall.ai receives the meeting URL and `join_at`, joins the call, and delivers recording/transcript webhooks through the existing Recall webhook flow.
- Calendar import, calendar webhooks, and Recall Calendar V1/V2 are intentionally not used.

One organization owner/admin connects the provider accounts. A single Google
authorization supplies both Google Calendar and Google Meet permissions; Google
does not need to be connected twice. Google Calendar and Outlook Calendar may
both remain connected, but only one is the default destination at a time.

## Provider behavior

| Default calendar | Meeting platform | Result                                                                            |
| ---------------- | ---------------- | --------------------------------------------------------------------------------- |
| Google Calendar  | Google Meet      | A native Google Calendar event with Google Meet conference data                   |
| Google Calendar  | Zoom             | A Zoom meeting and a Google Calendar event containing the Zoom URL                |
| Outlook Calendar | Google Meet      | A standalone Google Meet space and only one Outlook event containing the Meet URL |
| Outlook Calendar | Zoom             | A Zoom meeting and an Outlook event containing the Zoom URL                       |

Scheduled meeting updates are applied to the provider meeting, calendar event, and Recall bot schedule. Failures trigger best-effort compensation back to the previous state. Cancellation is idempotent at the external calendar/meeting API boundary.

## Google Cloud setup

Enable these APIs in the existing Google Cloud project:

- Google Calendar API
- Google Meet REST API

Configure an OAuth Web application with this exact redirect URI:

```text
{APP_BASE_URL}/api/v1/google-meetings/oauth/callback
```

The backend requests identity plus these delegated scopes:

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/meetings.space.created
```

While the consent screen is in Testing mode, add every organizer Google account as an OAuth test user. Existing connections must reconnect after the Meet scope is added.

Required environment values:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://backend.example.com/api/v1/google-meetings/oauth/callback
```

## Microsoft Entra setup

Create a Web app registration with:

- Supported account type: **Accounts in any organizational directory and personal Microsoft accounts**
- Redirect URI: `{APP_BASE_URL}/api/v1/calendar/outlook/oauth/callback`
- Delegated Microsoft Graph permissions: `User.Read` and `Calendars.ReadWrite`

The authorization request also includes `openid`, `profile`, `email`, and `offline_access`.

Required environment values:

```dotenv
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_TENANT=common
MICROSOFT_OAUTH_REDIRECT_URI=https://backend.example.com/api/v1/calendar/outlook/oauth/callback
```

Store the client secret **value**, not the secret identifier. Track its expiry and rotate it before expiration.

## Zoom and Recall setup

The Zoom account is connected through the Recall-managed Zoom OAuth credential
flow. Configure the Zoom OAuth app callback as:

```text
{APP_BASE_URL}/api/v1/zoom-meetings/oauth/callback
```

Configure Recall's webhook destination as:

```text
{APP_BASE_URL}/api/v1/webhooks/recall
```

Required runtime services and values:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
RECALLAI_API_KEY=
RECALLAI_WEBHOOK_SECRET=whsec_...
RECALLAI_REGION=us-west-2
RECALLAI_SIGNED_IN_ZOOM=true
ZOOM_OAUTH_CLIENT_ID=
ZOOM_OAUTH_REDIRECT_URI=https://backend.example.com/api/v1/zoom-meetings/oauth/callback
RECALLAI_ZOOM_OAUTH_APP_ID=
```

MongoDB stores meeting/calendar state and Redis/BullMQ handles Recall bot and
webhook jobs. Both services must be available when testing the complete flow.

## Shared security and defaults

```dotenv
INTEGRATION_ENCRYPTION_KEY=replace-with-at-least-32-random-characters
MEETING_OAUTH_STATE_SECRET=replace-with-at-least-32-random-characters
MEETING_INTEGRATIONS_FRONTEND_URL=https://app.example.com/dashboard/integrations
MEETING_DEFAULT_TIMEZONE=Asia/Dhaka
MEETING_DEFAULT_DURATION_MINUTES=30
MEETING_DEFAULT_REMINDER_MINUTES=15
```

OAuth access and refresh tokens are encrypted before being stored. OAuth state is signed, persisted, single-use, and expires after ten minutes.

## API flow

### Calendar connections

```text
GET    /api/v1/google-meetings/oauth/connect
GET    /api/v1/google-meetings/oauth/callback
GET    /api/v1/google-meetings/oauth/connection
DELETE /api/v1/google-meetings/oauth/connection

GET    /api/v1/calendar/outlook/oauth/connect
GET    /api/v1/calendar/outlook/oauth/callback
GET    /api/v1/calendar/outlook/oauth/connection
DELETE /api/v1/calendar/outlook/oauth/connection

GET    /api/v1/calendar/connections
PATCH  /api/v1/calendar/default
```

Only organization owners and administrators can connect, disconnect, or switch the default calendar.

Example default selection:

```json
{
  "provider": "OUTLOOK_CALENDAR"
}
```

### Standalone calendar-event lifecycle

These endpoints manage events created directly from the platform, without
creating a Google Meet or Zoom meeting:

```text
POST   /api/v1/calendar/events
GET    /api/v1/calendar/events
GET    /api/v1/calendar/events/:id
PATCH  /api/v1/calendar/events/:id
DELETE /api/v1/calendar/events/:id
```

Create, update, and cancel are restricted to organization owners/admins. The
backend stores the provider event ID and lifecycle status so created events can
be listed and managed from the platform. Reusing an `idempotencyKey` prevents a
duplicate provider event when the same create request is retried.

Example event request:

```json
{
  "title": "Board preparation",
  "description": "Prepare the quarterly review",
  "startTime": "2027-01-15T10:00:00.000Z",
  "endTime": "2027-01-15T10:30:00.000Z",
  "timezone": "Asia/Dhaka",
  "attendees": ["guest@example.com"],
  "reminderMinutesBeforeStart": 15,
  "idempotencyKey": "board-preparation-2027-01-15"
}
```

### Meeting lifecycle

```text
POST   /api/v1/meetings
PATCH  /api/v1/meetings/:id
DELETE /api/v1/meetings/:id
POST   /api/v1/meetings/:id/bot
```

Example scheduled Google Meet request:

```json
{
  "platform": "GOOGLE_MEET",
  "title": "Customer review",
  "agenda": "Review rollout status and next steps",
  "startsAt": "2027-01-15T10:00:00.000Z",
  "durationMinutes": 30,
  "timezone": "Asia/Dhaka",
  "invitees": ["guest@example.com"],
  "reminderMinutesBeforeStart": 15,
  "sendBot": true,
  "idempotencyKey": "customer-review-2027-01-15"
}
```

The selected default calendar is resolved server-side. Clients do not choose a calendar provider per meeting request.

## End-to-end Swagger test guide

Open `{APP_BASE_URL}/api/docs`. OAuth authorization itself opens in the provider
website, so Swagger returns an `authorizationUrl` that must be copied into a
normal browser tab.

### 1. Authenticate Swagger

1. Run `POST /api/v1/auth/login` with an organization owner/admin account.
2. A successful login automatically authorizes Swagger. Alternatively, copy
   `data.accessToken`, click **Authorize**, and paste the token.
3. Run `GET /api/v1/auth/me`; expect `200` and the correct organization.
4. A hard refresh keeps the Swagger authorization until the access token
   expires. `POST /api/v1/auth/logout` or **Authorize → Logout** clears it.

### 2. Connect Google Calendar and Google Meet

1. Run `GET /api/v1/google-meetings/oauth/connect`.
2. Copy `data.authorizationUrl` into a browser tab, choose the organizer Google
   account, and grant both Calendar and Meet permissions.
3. Google returns to the configured callback and then redirects to
   `MEETING_INTEGRATIONS_FRONTEND_URL`.
4. Return to Swagger and run
   `GET /api/v1/google-meetings/oauth/connection`; expect `connected: true` and
   the organizer email.
5. Run `GET /api/v1/calendar/connections`; expect
   `GOOGLE_CALENDAR.connected: true`. This proves the same Google connection is
   available to both Calendar and Meet.

If Google is in Testing mode, the organizer email must be listed as a test user.
If no refresh token is returned, revoke the app grant from the Google account
and reconnect so the consent screen runs again.

### 3. Connect Outlook Calendar

1. Run `GET /api/v1/calendar/outlook/oauth/connect`.
2. Open `data.authorizationUrl`, sign in with the organizer's Microsoft work
   account, and consent to `User.Read` and `Calendars.ReadWrite`.
3. Run `GET /api/v1/calendar/outlook/oauth/connection`; expect
   `connected: true`.
4. Run `GET /api/v1/calendar/connections`; both providers may show connected.

The configured `common` authority accepts personal Microsoft accounts and Entra
work/school accounts. A personal account must have an Outlook.com mailbox; a
work/school account must have an Exchange Online mailbox. In the Entra app
registration, select **Accounts in any organizational directory and personal
Microsoft accounts**, otherwise Microsoft will reject personal sign-in even
when the backend uses `common`.

### 4. Select and verify the default calendar

Run `PATCH /api/v1/calendar/default` with one of:

```json
{ "provider": "GOOGLE_CALENDAR" }
```

```json
{ "provider": "OUTLOOK_CALENDAR" }
```

Then run `GET /api/v1/calendar/connections` and verify exactly one connected
provider has `isDefault: true`.

### 5. Test a standalone calendar event

1. Run `POST /api/v1/calendar/events` using a time safely in the future and a
   unique `idempotencyKey`.
2. Save the returned internal `data.id`; do not use `providerEventId` as the API
   path parameter.
3. Confirm the event appears only in the selected default provider calendar.
4. Run `GET /api/v1/calendar/events` and
   `GET /api/v1/calendar/events/{id}`.
5. Run `PATCH /api/v1/calendar/events/{id}` with a later time or changed title;
   confirm the same provider event changes.
6. Run `DELETE /api/v1/calendar/events/{id}`; confirm its local status becomes
   `CANCELLED` and the provider event is removed.

### 6. Connect Zoom

1. Run `GET /api/v1/zoom-meetings/oauth/connect`.
2. Open `data.authorizationUrl` and authorize the organizer's Zoom account.
3. Run `GET /api/v1/zoom-meetings/oauth/connection`; expect `connected: true`.

### 7. Test scheduled meetings and Recall

Use `POST /api/v1/meetings` with a future start time. Test all four combinations
by switching the default calendar and changing `platform` between
`GOOGLE_MEET` and `ZOOM`. Use a new `idempotencyKey` for each distinct meeting.

Expected results:

- `status` is `SCHEDULED` and `joinUrl` is present.
- `calendarProvider` matches the current default.
- `calendarEventId` and `meetingBotId` are saved.
- Exactly one calendar event exists, and its body/location contains the meeting
  link when the meeting and calendar providers differ.
- With Outlook default + Google Meet, only Outlook contains the event; Google is
  used only to create the Meet space.

Use the returned meeting `id` with:

```text
GET    /api/v1/meetings/:id
PATCH  /api/v1/meetings/:id
DELETE /api/v1/meetings/:id
POST   /api/v1/meetings/:id/bot
```

`PATCH` should update the provider meeting, the single calendar event, and the
scheduled Recall bot. `DELETE` should cancel the scheduled bot and remove the
provider-managed calendar event/meeting where the provider supports deletion.

After Recall sends the completion webhooks, take `meetingBotId` from the meeting
response and test:

```text
GET /api/v1/meeting-bots/:meetingBotId/transcript
GET /api/v1/meeting-bots/:meetingBotId/audio
```

Transcript/audio return `404` until Recall has finished processing them. Audio
URLs may be temporary and should not be stored by clients.

### 8. Failure checks

- Repeat the exact create request with the same `idempotencyKey`; it must return
  the same record with `duplicate: true`, not create another calendar event or
  bot.
- Disconnect the non-default calendar; the default should remain unchanged.
- A non-owner/non-admin should receive `403` for connection, default selection,
  event mutation, and connected-meeting mutation endpoints.
- Use `GET /api/v1/calendar/events?status=FAILED` and meeting list filters to
  inspect any provider failure saved for operational recovery.

## Operational notes

- Before deploying over the legacy Zoom-only module, audit the old collections:

  ```text
  pnpm run migrate:meeting-bots
  ```

  After taking a MongoDB backup and confirming the preflight reports zero
  unique-key conflicts, run `pnpm run migrate:meeting-bots:execute`. When old
  and new collections both contain records, the migration safely merges missing
  records and preserves the legacy collections as rollback copies.

- Keep a stable client-provided `idempotencyKey` when retrying a meeting creation request.
- A meeting stores its provider meeting ID, calendar provider/event ID, and internal Recall meeting-bot ID.
- Scheduled Recall bot creation itself is not billed until the bot machine becomes active, but normal Recall recording/transcription usage still applies.
- If credentials are revoked or expire, reconnect the affected provider before retrying an update or cancellation.
