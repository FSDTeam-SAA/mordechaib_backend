# Organizer-connected Zoom and Google Meet: Phase 1

Phase 1 lets an organization owner or administrator connect the organization's
Zoom and Google accounts. Any authenticated user in that organization can then
create an instant or scheduled meeting. The backend creates the provider
meeting, stores its URLs encrypted, and queues a Recall bot through the common
`meeting_bots` pipeline.

Calendar event discovery, inbound calendar synchronization, recurring-event
reconciliation, and Google/Outlook webhooks are intentionally outside Phase 1.
Google Calendar is used only when the application creates a Google Meet event.

## Data model

- `integrations`: one organization-scoped connection per provider. OAuth tokens
  are encrypted before storage and excluded from normal Mongo queries.
- `meeting_oauth_states`: short-lived, one-time OAuth state nonces. MongoDB
  removes expired records through a TTL index.
- `platform_meetings`: provider-created meetings and encrypted host/join URLs.
- `meeting_bots`: common Recall bot lifecycle for `ZOOM` and `GOOGLE_MEET`.
- `meeting_transcripts`: common MongoDB transcript storage.

Audio remains in Recall for 168 hours. `RecallAudioStorage` returns a fresh
temporary download URL. The `MeetingAudioStorage` interface allows an S3
adapter to replace it later without changing meeting orchestration.

## Required configuration

Use different OAuth applications and credentials for development and
production.

```dotenv
APP_BASE_URL=https://api.example.com
FRONTEND_URL=https://app.example.com
MEETING_INTEGRATIONS_FRONTEND_URL=https://app.example.com/dashboard/integrations
MEETING_OAUTH_STATE_SECRET=<at-least-32-random-characters>
MEETING_DEFAULT_TIMEZONE=Asia/Dhaka
MEETING_DEFAULT_DURATION_MINUTES=30

INTEGRATION_ENCRYPTION_KEY=<at-least-32-random-characters>

ZOOM_OAUTH_CLIENT_ID=<zoom-client-id>
ZOOM_OAUTH_REDIRECT_URI=https://api.example.com/api/v1/zoom-meetings/oauth/callback
RECALLAI_ZOOM_OAUTH_APP_ID=<recall-zoom-oauth-app-id>

GOOGLE_OAUTH_CLIENT_ID=<google-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<google-client-secret>
GOOGLE_OAUTH_REDIRECT_URI=https://api.example.com/api/v1/google-meetings/oauth/callback

# Guest bot mode: leave this empty.
RECALLAI_GOOGLE_MEET_LOGIN_GROUP_ID=
```

The Zoom user-managed OAuth application needs permission to read the connected
user's profile and ZAK, and to create/read/delete meetings. Use either the
current granular equivalents or these classic scopes when offered by Zoom:

```text
user_info:read
user_zak:read
meeting:read
meeting:write
```

The Google OAuth consent screen must enable the Google Calendar API. The
backend requests `openid`, `email`, `profile`, and
`https://www.googleapis.com/auth/calendar.events`.

The redirect URI configured at each provider must exactly match the relevant
backend callback above.

## Authorization rules

- Connect/disconnect Zoom or Google: `OWNER`, `ADMIN`.
- View connection status: every authenticated organization user.
- Create/list/read meetings: every authenticated organization user.
- Host URL, bot retry, and cancellation: meeting creator, `OWNER`, or `ADMIN`.
- Every database query is scoped by the authenticated user's organization.

## Swagger test sequence

Authorize Swagger with a bearer token. The `x-organization-id` header is
optional; if supplied, it must match the organization in the token.

### 1. Connect Zoom

Call:

```text
GET /api/v1/zoom-meetings/oauth/connect
```

Open the returned `authorizationUrl`, approve Zoom access, then verify:

```text
GET /api/v1/zoom-meetings/oauth/connection
```

Expected: `connected: true` and the connected account's safe profile fields.

### 2. Connect Google

Call and open the returned URL:

```text
GET /api/v1/google-meetings/oauth/connect
```

Then verify:

```text
GET /api/v1/google-meetings/oauth/connection
```

Google should show a consent screen for creating and managing calendar events.

### 3. Create an instant Google Meet

```http
POST /api/v1/meetings
Content-Type: application/json
```

```json
{
  "platform": "GOOGLE_MEET",
  "title": "Google Meet Recall test",
  "durationMinutes": 30,
  "timezone": "Asia/Dhaka",
  "invitees": ["guest@example.com"],
  "sendBot": true,
  "botName": "Noltra AI Notetaker",
  "idempotencyKey": "google-meet-swagger-test-001"
}
```

Open `startUrl` as the organizer. The Recall bot joins as a guest; admit it when
Google Meet asks for permission.

### 4. Create a scheduled Zoom meeting

Use a future RFC 3339 UTC time for `startsAt`:

```http
POST /api/v1/meetings
Content-Type: application/json
```

```json
{
  "platform": "ZOOM",
  "title": "Zoom Recall test",
  "agenda": "Verify bot, transcript, and audio",
  "startsAt": "2099-09-01T10:00:00.000Z",
  "durationMinutes": 30,
  "timezone": "Asia/Dhaka",
  "invitees": ["guest@example.com"],
  "sendBot": true,
  "botName": "Noltra AI Notetaker",
  "idempotencyKey": "zoom-swagger-test-001"
}
```

Replace the sample date with a real future time. Reusing the same idempotency
key for the same platform and organization returns the existing record.

Before opening a Zoom meeting, call `GET /api/v1/meetings/{id}`. This refreshes
Zoom's short-lived host `startUrl`.

### 5. Verify the bot and media

The platform meeting `id` and `meetingBotId` are different records. Use
`meetingBotId` with the common bot endpoints:

```text
GET /api/v1/meeting-bots/{meetingBotId}
GET /api/v1/meeting-bots/{meetingBotId}/transcript
GET /api/v1/meeting-bots/{meetingBotId}/audio
```

Transcript and audio are not ready immediately when the call ends. Recall first
finishes the recording and asynchronous transcript, then delivers signed
webhooks. Poll the bot status until it becomes `COMPLETED`.

If meeting creation succeeds but Redis/Recall bot queueing fails, the create
response keeps the usable meeting URL and includes a warning. Retry with:

```text
POST /api/v1/meetings/{id}/bot
```

Cancel a provider meeting and its pending bot with:

```text
DELETE /api/v1/meetings/{id}
```

The older `POST /zoom-meetings`, `POST /google-meetings`, and
`POST /meeting-bots` routes remain available for manually supplied meeting
URLs.

## External API references

- [Recall signed-in Zoom bots](https://docs.recall.ai/docs/zoom-signed-in-bots)
- [Zoom meeting API](https://developers.zoom.us/docs/api/meetings/)
- [Zoom user/ZAK API](https://developers.zoom.us/docs/api/users/)
- [Google Calendar event insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Google conference creation](https://developers.google.com/workspace/calendar/api/guides/create-events#add_video_and_phone_conferences_to_events)
