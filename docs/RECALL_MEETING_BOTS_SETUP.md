# Recall.ai Meeting Bots (Zoom and Google Meet)

The meeting-bots module supports manual and scheduled Zoom and Google Meet
bots. Recall stores mixed MP3 audio for the configured retention period. The
application stores post-meeting transcripts in MongoDB and returns a fresh
Recall audio URL through the authenticated audio endpoint.

## Architecture

- `meeting_bots` stores both platforms using `platform: ZOOM | GOOGLE_MEET`.
- `meeting_transcripts` stores transcripts for both platforms.
- `/api/v1/webhooks/recall` is the single signed Recall webhook endpoint.
- BullMQ creates bots and processes webhook events with retries.
- `MeetingAudioStorage` isolates storage policy. The current adapter is
  `RecallAudioStorage`; an S3 adapter can be added without changing meeting
  lifecycle code.

## Required environment

Configure the Recall, Redis, encryption, and storage settings from
`.env.example`. Manual Google Meet guest bots do not require Google OAuth or a
Google Calendar connection.

For signed-in Google Meet bots, configure a Google Login Group in the same
Recall region and set:

```dotenv
RECALLAI_GOOGLE_MEET_LOGIN_GROUP_ID=<recall-google-login-group-id>
```

Leave this value empty for guest-bot testing. Guest bots normally require a
host or eligible participant to admit them into Google Meet.

For a Google-Meet-only production deployment without Zoom OAuth, also set
`RECALLAI_SIGNED_IN_ZOOM=false`. Keep it enabled when the existing signed-in
Zoom flow remains in use.

## Existing Zoom data migration

The application does not rename MongoDB collections automatically. First back
up MongoDB and preview the migration:

```bash
pnpm migrate:meeting-bots
```

After reviewing the dry-run output:

```bash
pnpm migrate:meeting-bots:execute
```

The migration can replace an empty target collection auto-created by Mongoose,
but refuses to continue if both a legacy collection and a non-empty target
collection exist. It preserves document IDs, marks legacy records as `ZOOM`,
replaces the temporary cached audio URL with the Recall recording reference,
and renames:

- `zoom_meetings` to `meeting_bots`
- `zoom_meeting_transcripts` to `meeting_transcripts`

## Swagger manual Google Meet test

1. Start MongoDB and Redis and expose the API over stable public HTTPS.
2. Configure the Recall webhook endpoint as
   `{APP_BASE_URL}/api/v1/webhooks/recall` and subscribe to `bot.*`,
   `recording.done`, `recording.failed`, `transcript.done`, and
   `transcript.failed`.
3. Open `/api/docs`, authorize with an organization user's bearer token, and
   call `POST /api/v1/google-meetings`:

```json
{
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "botName": "Noltra AI Notetaker",
  "idempotencyKey": "manual-google-meet-test-1"
}
```

4. Admit the guest bot into the meeting, speak briefly, and end the call.
5. Check `GET /api/v1/google-meetings/{id}` until processing completes.
6. Fetch the transcript from
   `GET /api/v1/meeting-bots/{botId}/transcript` and the temporary Recall audio
   URL from `GET /api/v1/meeting-bots/{botId}/audio`.

The generic `POST /api/v1/meeting-bots` endpoint is also available and requires
`platform` in the body. Existing `/api/v1/zoom-meetings` endpoints remain
compatible.

## Organizer-connected meeting creation

The manual URL endpoints above remain supported. Phase 1 also provides
organization-scoped Zoom and Google OAuth connections and a common
`POST /api/v1/meetings` endpoint that creates the provider meeting before
queuing its Recall bot. See
[`ORGANIZER_CONNECTED_MEETINGS_PHASE_1.md`](./ORGANIZER_CONNECTED_MEETINGS_PHASE_1.md)
for configuration, roles, OAuth routes, scopes, and complete Swagger payloads.
