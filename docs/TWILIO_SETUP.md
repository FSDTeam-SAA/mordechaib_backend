# Twilio Call Forwarding + Recording — Local Setup Guide

This guide walks you through testing the **incoming call forwarding feature** on your local machine:

> A caller dials your Twilio business number → Twilio forwards the call to your real BD phone number → you talk → Twilio records the conversation → Twilio sends the recording to your backend via webhook → your backend downloads the audio and stores it locally (`storage/recordings/`).

---

## Architecture

```
Caller
  │  dials Twilio business number (+17373855812)
  ▼
Twilio
  │  POST /api/v1/webhooks/twilio/voice  (CallSid, From, To, …)
  ▼
NestJS backend (via ngrok)
  │  * validates X-Twilio-Signature
  │  * looks up TwilioSetting by "To" number
  │  * writes CallLog to MongoDB
  │  * returns TwiML:  <Dial record="record-from-answer-dual">
  │                        <Number>+8801XXXXXXXXX</Number>
  │                    </Dial>
  ▼
Twilio
  │  dials your BD forwarding number, records both parties
  │  POST /api/v1/webhooks/twilio/recording?callSid=…  (RecordingUrl, …)
  ▼
NestJS backend
  │  * downloads the .wav audio using Twilio Basic auth
  │  * stores it at  storage/recordings/{callSid}/{recordingSid}.wav
  │  * writes CallRecording row (recordingUrl + localFilePath) to MongoDB
  └────────────────────────────────────────────┐
                                              ▼
                                    Done — recording saved on your backend
```

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js + pnpm | Same as normal backend dev |
| [ngrok](https://ngrok.com/download) | Free account; exposes `localhost:5000` to the internet |
| Twilio account | Trial or paid; with a voice-enabled phone number |
| Twilio Console access | https://console.twilio.com |
| Your BD phone number | The real number Twilio will forward calls to |

---

## 2. Start the backend + tunnel

### 2a. Run the helper (or do it manually)

**Option A — helper script (Windows):**
```bash
scripts\twilio-local-setup.bat
```

**Option B — manually:**
```bash
ngrok http 5000
```

You should see output like:
```
Forwarding   https://abcd-123-456.ngrok-free.dev -> http://localhost:5000
```

> ⚠️ **IMPORTANT** — copy the `https://…ngrok-free.dev` URL **without any trailing spaces**.

### 2b. Update `.env`

```dotenv
APP_BASE_URL=https://abcd-123-456.ngrok-free.dev
```

**No trailing spaces.** If you accidentally add one, every Twilio webhook will fail with `401 Invalid Twilio signature` because the URL used for signature validation would be malformed.

### 2c. Start the backend

```bash
pnpm install
pnpm start:dev
```

Expected log:
```
Noltra API running on http://localhost:5000
```

---

## 3. Configure Twilio Console

1. Open **Twilio Console → Phone Numbers → Manage → Active Numbers**
2. Click your **Twilio business number** (`+17373855812` in your `.env`)
3. Under **Voice & fax** set:
   - **When a call comes in** → `Webhook`
   - **URL** → `https://abcd-123-456.ngrok-free.dev/api/v1/webhooks/twilio/voice`
   - **HTTP method** → `POST`
4. Click **Save**

---

## 4. Create the Twilio setting in your backend

The webhook returns "This phone number is not currently configured" unless a matching **TwilioSetting** row exists.

### 4a. Find your organization ID

Use your existing auth endpoints (`POST /api/v1/auth/...`) to get a JWT and your `organizationId` from `GET /api/v1/organizations/me` (or via your admin panel).

### 4b. Save the Twilio setting

Authenticated request:

```http
POST /api/v1/twilio/settings
Authorization: Bearer <your-jwt>
Content-Type: application/json
```

```json
{
  "twilioNumber": "+17373855812",
  "forwardingNumber": "+8801XXXXXXXXX",
  "isRecordingEnabled": true,
  "status": "ACTIVE"
}
```

- `twilioNumber` — your Twilio business number (what callers dial)
- `forwardingNumber` — your **real BD phone number** (where Twilio forwards the call)
- `isRecordingEnabled` — set to `true` to record both parties and receive the recording webhook

You should see the setting in the response (a `twilio_settings` MongoDB document).

---

## 5. Test the full flow

1. From any phone, **call your Twilio business number** (`+17373855812`)
2. Your BD phone rings — **answer it and talk**
3. When both parties hang up, Twilio:
   - POSTs `dial-status` → backend updates the `CallLog.status` + duration
   - POSTs `recording` (RecordingUrl) → backend **downloads the audio** and stores it at:

```
storage/recordings/{CallSid}/{RecordingSid}.wav
```

4. Open `storage/recordings/` — you should see the audio file.

### Verify in MongoDB

```js
// call_logs (call record + status + duration)
db.call_logs.find({ callSid: "CA..." })

// call_recordings (recording metadata + localFilePath)
db.call_recordings.find({ recordingSid: "RE..." })
// → { recordingUrl: "https://api.twilio.com/...", localFilePath: "storage/recordings/CA.../RE....wav" }
```

---

## 6. How the TwiML works (the forwarding)

`handleIncomingCall` in `src/modules/twilio/twilio.service.ts` returns TwiML that:

1. **Records the call** — `record="record-from-answer-dual"` captures **both** the caller and the forwarded (BD) party.
2. **Forwards the call** — `<Dial>` + `<Number>{forwardingNumber}</Number>`.
3. **Reports completion** — `action` → `/dial-status` and `recordingStatusCallback` → `/recording`.

Twilio then sends the completed recording to:
```
POST https://abcd-123-456.ngrok-free.dev/api/v1/webhooks/twilio/recording?callSid=CA…
```

Your backend:
- Validates `X-Twilio-Signature` (raw body, exact URL — no trailing-space bug)
- Persists metadata in `call_recordings`
- **Downloads the `.wav` using Basic auth** (`TwilioProvider.downloadRecordingMedia`)
- Stores it locally via `RecordingStorageService.storeRecording` → `storage/recordings/{callSid}/{recordingSid}.wav`
- Writes `localFilePath` to the MongoDB document

---

## 7. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `401 Missing Twilio signature` in Swagger/curl | Expected. Real Twilio webhooks always send `X-Twilio-Signature`. Manual tests need to generate the HMAC. |
| `401 Invalid Twilio signature` even though Twilio sent it | `APP_BASE_URL` has a trailing space or doesn't exactly match the webhook URL configured in Twilio Console. Fix `.env`, restart. |
| `503 Twilio webhook validation is not configured` | `TWILIO_AUTH_TOKEN` or `APP_BASE_URL` missing in `.env`. |
| TwiML says "This phone number is not currently configured" | No active `TwilioSetting` for the `To` number. Create one via `POST /api/v1/twilio/settings`. |
| ngrok free tier interstitials | Add `?ngrok-skip-browser-warning=1` is not needed for webhooks; if you see it, open the ngrok URL in a browser once to accept, then re-run. |
| Recording never arrives | Ensure `isRecordingEnabled: true` and that `recordingStatusCallback` URL in the generated TwiML is reachable (check `storage/recordings` + backend logs). |
| `fetch` is not defined | Node < 18. Use Node 18+ (the project targets modern Node). |
| Audio download fails with 404 | Trial Twilio accounts keep recordings only for a limited time; make sure the webhook fires shortly after the call ends. |

---

## 8. Production notes

- `storage/recordings/` is **git-ignored** — in production, replace `RecordingStorageService` with an S3-compatible uploader (the storage interface is already isolated).
- `TWILIO_LIVE_MODE=true` enables **real outbound calls** in `TwilioProvider.createCall`. Leave unset (mocked) while testing incoming forwarding only.
- Always keep `APP_BASE_URL` free of trailing whitespace — the Twilio signature is computed against the exact URL.