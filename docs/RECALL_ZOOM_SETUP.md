# Recall.ai Zoom Bot Setup

<<<<<<< HEAD
> The runtime implementation now uses the shared meeting-bots domain. See
> `docs/RECALL_MEETING_BOTS_SETUP.md` for the common architecture, MongoDB
> migration, and Google Meet manual test flow. Existing Zoom endpoints remain
> compatible.

=======
>>>>>>> d72931716fd6ba867479d36bc9d925d92ac7cc69
This module supports Zoom only. It creates immediate or scheduled Recall.ai
bots, records mixed MP3 audio for 168 hours, creates a post-meeting transcript,
and stores the complete transcript in MongoDB. Redis/BullMQ handles bot creation
and webhook processing with retries.

## Runtime environment

Copy the Recall/Zoom section from `.env.example` and provide these values:

- `APP_BASE_URL`: stable public HTTPS base URL. Use the ngrok origin locally and
  the Render service origin in production, without a trailing slash.
- `RECALLAI_API_KEY`: API key from the selected Recall workspace and region.
- `RECALLAI_WEBHOOK_SECRET`: Recall workspace verification secret beginning with
  `whsec_`.
- `RECALLAI_REGION`: `us-west-2`, `us-east-1`, `eu-central-1`, or
  `ap-northeast-1`. The API key and secret must come from the same region.
- `ZOOM_OAUTH_CLIENT_ID`: client ID of the Zoom OAuth app.
- `RECALLAI_ZOOM_OAUTH_APP_ID`: ID created when the Zoom OAuth app is registered
  in Recall.
- `REDIS_URL`: local Redis URL during ngrok testing and the private Render Key
  Value URL in production.
- `INTEGRATION_ENCRYPTION_KEY` and `RECALLAI_OAUTH_STATE_SECRET`: independent,
  random secrets of at least 32 characters.

Keep the configured values at:

```dotenv
RECALLAI_TRANSCRIPTION_MODE=POST_MEETING
RECALLAI_RECORDING_OUTPUT=TRANSCRIPT_AND_AUDIO
RECALLAI_RETENTION_HOURS=168
RECALLAI_SIGNED_IN_ZOOM=true
RECALLAI_MAX_CONCURRENT_MEETINGS=100
RECALLAI_MAX_CONCURRENT_MEETINGS_PER_ORG=10
TRANSCRIPT_STORAGE=MONGODB
AUDIO_STORAGE_PROVIDER=RECALL
```

The Zoom client secret and Zoom webhook secret token are entered when creating
the Zoom OAuth App inside Recall; this application deliberately does not keep
them. Never commit `.env`.

## Zoom and Recall one-time setup

1. Create a user-managed Zoom OAuth app and add the `user:read:zak` scope. Use a
   dedicated licensed Zoom user for bot authorization; one Zoom account can be
   limited by Zoom's simultaneous-meeting rules.
2. Set this exact Zoom OAuth redirect/allow URL:

   ```text
   {APP_BASE_URL}/api/v1/zoom-meetings/oauth/callback
   ```

3. In the Recall dashboard for `RECALLAI_REGION`, create a Zoom OAuth App using
   the Zoom client ID, client secret, and Zoom webhook secret token. Put its
   returned ID in `RECALLAI_ZOOM_OAUTH_APP_ID`.
4. In Recall's Webhooks dashboard, create this endpoint:

   ```text
   {APP_BASE_URL}/api/v1/webhooks/recall
   ```

   Subscribe it to `bot.*`, `recording.done`, `recording.failed`,
   `transcript.done`, and `transcript.failed`.

5. Create a Recall workspace verification secret and put the `whsec_...` value
   in `RECALLAI_WEBHOOK_SECRET`. The same secret authenticates webhook requests
   and the synchronous ZAK callback.

Official references: [signed-in Zoom bots](https://docs.recall.ai/docs/zoom-signed-in-bots),
[post-meeting transcription](https://docs.recall.ai/docs/async-transcription),
and [request verification](https://docs.recall.ai/docs/authenticating-requests-from-recallai).

## Local ngrok test

1. Start MongoDB and Redis. A local Redis default is
   `redis://127.0.0.1:6379`.
2. Start a stable ngrok tunnel to the backend port, for example `ngrok http
5000`.
3. Set the ngrok HTTPS origin as `APP_BASE_URL`. Set the matching OAuth redirect
   in Zoom and the matching webhook endpoint in Recall, then restart the API.
4. As a platform admin, call `GET /api/v1/zoom-meetings/oauth/connect` with a
   bearer token. Open the returned `authorizationUrl` and authorize the
   dedicated Zoom account once.
5. Confirm `GET /api/v1/zoom-meetings/oauth/connection` returns `connected:
true`.
6. Create a bot with `POST /api/v1/zoom-meetings`. Both bearer authentication
   and the user's organization context are enforced.

Immediate example:

```json
{
  "meetingUrl": "https://zoom.us/j/123456789?pwd=...",
  "idempotencyKey": "org-event-or-request-id"
}
```

Scheduled example (schedule at least 10 minutes ahead):

```json
{
  "meetingUrl": "https://zoom.us/j/123456789?pwd=...",
  "joinAt": "2026-08-25T10:00:00.000Z",
  "idempotencyKey": "calendar-event-id"
}
```

Use a stable unique `idempotencyKey` for each logical meeting occurrence. This
enforces one bot per organization per occurrence even when clients retry.

After the meeting:

- `GET /api/v1/zoom-meetings/{id}` returns lifecycle status.
- `GET /api/v1/zoom-meetings/{id}/transcript` returns the MongoDB transcript.
- `GET /api/v1/zoom-meetings/{id}/audio` returns a fresh Recall download URL
  until its 168-hour retention expires.
- `DELETE /api/v1/zoom-meetings/{id}` cancels a pending/scheduled bot.
- `POST /api/v1/zoom-meetings/{id}/leave` removes a bot already joining/in call.

## Render production switch

Deploy the web service on an always-on paid Render instance so Recall callbacks
do not hit a sleeping service. Add Render Key Value and use its private Redis URL
as `REDIS_URL`. Keep the same code and change only environment/dashboard values:

1. Set `NODE_ENV=production` and `APP_BASE_URL=https://<service>.onrender.com`.
2. Change `ZOOM_OAUTH_REDIRECT_URI`, the Zoom app redirect allowlist, and the
   Recall webhook endpoint from ngrok to the Render URLs.
3. Use production Recall/Zoom credentials from the intended region/workspace.
4. Re-run the platform-admin OAuth connection once if the production workspace
   or Zoom OAuth app differs from local testing.
5. Send a Recall test webhook, then run one short real Zoom meeting and verify
   bot status, audio availability, transcript persistence, retry logs, and
   organization access control before opening traffic.

Audio URLs are not exposed by the general meeting endpoints and are refreshed
through the authenticated audio endpoint. Moving audio to S3 later requires an
S3 storage adapter; changing `AUDIO_STORAGE_PROVIDER` early intentionally fails
startup instead of silently losing audio.
