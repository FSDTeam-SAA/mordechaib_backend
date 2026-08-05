# Outgoing (Click-to-Call) Feature — Setup & Local Testing Guide

This guide walks you through the **outgoing call (click-to-call)** feature:

> A user clicks "Call" in the frontend → the backend asks Twilio to ring the **agent's phone** first → when the agent answers, Twilio fetches TwiML that dials the **client's phone** and bridges both parties → call status + duration are tracked in MongoDB.

---

## Architecture

```
Frontend (NestJS API)
  │  POST /api/v1/calls/outbound  { clientPhone, agentPhone? }
  ▼
CallsService → TwilioService.initiateOutboundCall()
  │  * looks up the org's active TwilioSetting (twilioNumber + forwardingNumber)
  │  * calls Twilio REST API:  createCall(from: twilioNumber, to: agentPhone,
  │      url: /api/v1/webhooks/twilio/outbound-connect?clientPhone=...)
  ▼
Twilio
  │  rings the agent's phone (first leg)
  ▼  agent answers
Twilio fetches TwiML from  POST /api/v1/webhooks/twilio/outbound-connect?callSid=...&clientPhone=...
  │
  ▼
TwilioController.handleOutboundConnect → TwilioService.handleOutboundConnect()
  │  returns <Dial callerId="+twilioNumber" action="/dial-status" answerOnBridge>
  │            <Number>clientPhone</Number>
  │         </Dial>
  ▼
Twilio
  │  dials the client (second leg) and bridges both parties
  │  sends status updates to  POST /api/v1/webhooks/twilio/call-status
  ▼
TwilioService.handleCallStatusCallback → CallRecordsService.updateCallStatus()
  │  * maps Twilio status → CallStatus enum
  │  * updates the MongoDB call_log document (status, duration, price)
  └───────────────────────────────────────────┐
                                              ▼
                          Call lifecycle tracked end-to-end in MongoDB
```

---

## Local Testing (Mock Mode)

By default `TWILIO_LIVE_MODE=false`, so `TwilioProvider.createCall` returns a
fake `dev_<timestamp>` call SID. **No real phone call is placed** and **no
Twilio credits are spent**, but the full API + database flow still runs,
which is exactly what you need to verify the feature locally.

### Prerequisites

| Requirement | Notes |
|---|---|
| Backend running locally | `pnpm start:dev` → http://localhost:5000 |
| A user account with JWT | Register/login via `/api/v1/auth/...` |
| A Twilio number in `.env` | `TWILIO_PHONE_NUMBER=+17373855812` |
| Your agent's real phone | What rings first in live mode |
| Your client's real phone | What gets dialed after the agent answers |

### 1. Start the backend

```bash
pnpm start:dev
```

Expected log:
```
Noltra API running on http://localhost:5000
```

### 2. Run the automated local test

```bash
node scripts/test-outbound-call.js
```

The script will:
1. **Login** → gets your JWT + organization ID
2. **Save Twilio settings** → `POST /api/v1/twilio/settings`
   (`twilioNumber: +17373855812`, `forwardingNumber: <agentPhone>`, recording on)
3. **Initiate the outbound call** → `POST /api/v1/calls/outbound`
   (`clientPhone: <clientPhone>`, `agentPhone: <agentPhone>`)
4. **List calls** → `GET /api/v1/calls` to confirm the call record was persisted

### 3. Manual curl test (alternative)

```bash
# 1. Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your-password"}'

# 2. Save Twilio setting (one-time)
curl -X POST http://localhost:5000/api/v1/twilio/settings \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"twilioNumber":"+17373855812","forwardingNumber":"+8801XXXXXXXXX","isRecordingEnabled":true,"status":"ACTIVE"}'

# 3. Initiate outbound call
curl -X POST http://localhost:5000/api/v1/calls/outbound \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"clientPhone":"+8801XXXXXXXXX","agentPhone":"+8801YYYYYYYYY"}'

# 4. Verify calls in DB
curl http://localhost:5000/api/v1/calls \
  -H "Authorization: Bearer <your-jwt>"
```

### 4. Verify in MongoDB

```js
db.call_logs.find({ direction: "OUTBOUND" })
// → { callSid: "dev_1722...", fromNumber: "+17373855812",
//     toNumber: "+8801...", direction: "OUTBOUND", status: "INITIATED" }
```

---

## Live Mode (Real Calls — with ngrok)

When the backend initiates an outbound call, Twilio must be able to reach two
endpoints on your local machine:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/webhooks/twilio/outbound-connect` | Fetched **after the agent answers** — returns TwiML that dials the client |
| `POST /api/v1/webhooks/twilio/call-status` | Receives **call lifecycle events** (`ringing`, `in-progress`, `completed`, …) |

Both URLs are derived from `APP_BASE_URL` in `.env`, so **your machine must be
publicly reachable via ngrok** before you place a real call.

### Step-by-step real-call test

#### 1. Start ngrok

```bash
ngrok http 5000
```

Note the ngrok URL, e.g.:
```
Forwarding   https://abcd-123-456.ngrok-free.dev -> http://localhost:5000
```

#### 2. Update `.env`

```dotenv
APP_BASE_URL=https://abcd-123-456.ngrok-free.dev
TWILIO_LIVE_MODE=true
```

> ⚠️ **No trailing spaces.** `APP_BASE_URL` is used verbatim for the Twilio
> webhook URLs and signature validation. A trailing space breaks both.

#### 3. Restart the backend

```bash
pnpm start:dev
```

#### 4. Create/verify the Twilio setting

The organization must have an active `TwilioSetting` with:

- `twilioNumber` → your Twilio phone number (`+17373855812`)
- `forwardingNumber` → your **agent's real phone** (the phone that rings first)
- `isRecordingEnabled` → `true` to record both parties

```bash
curl -X POST http://localhost:5000/api/v1/twilio/settings \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "twilioNumber": "+17373855812",
    "forwardingNumber": "+8801XXXXXXXXX",
    "isRecordingEnabled": true,
    "status": "ACTIVE"
  }'
```

#### 5. Place the real outbound call

```bash
curl -X POST http://localhost:5000/api/v1/calls/outbound \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"clientPhone": "+8801YYYYYYYYY", "agentPhone": "+8801XXXXXXXXX"}'
```

**Expected behavior:**
1. API returns a real Twilio `CA...` call SID (not `dev_...`)
2. **Your agent's phone rings** → answer it
3. Twilio fetches `outbound-connect` from your ngrok URL
4. Twilio dials the **client's phone**
5. When the client answers, both legs are bridged
6. When either party hangs up, `call-status` updates the CallLog with the final status, duration, and price

#### 6. Verify in MongoDB

```js
db.call_logs.find({ callSid: "CA..." })
// → { direction: "OUTBOUND", status: "COMPLETED",
//     durationSeconds: 45, price: 0.0125, priceUnit: "USD",
//     startedAt: ..., endedAt: ... }
```

#### 7. (Optional) Verify the recording

If `isRecordingEnabled` was `true`:
- After both parties hang up, Twilio POSTs the completed recording to
  `POST /api/v1/webhooks/twilio/recording?callSid=CA...`
- The backend downloads the audio and stores it at
  `storage/recordings/CA.../RE....wav`

---

### Important live-mode notes

| Item | Requirement |
|---|---|
| Twilio number | Must be **voice-enabled** in Twilio Console |
| Trial account | Add the agent + client numbers to **Verified Caller IDs** in Twilio Console (https://console.twilio.com/us1/account/phone-numbers/verified) |
| ngrok | Must stay running for the **entire** call lifecycle |
| `TWILIO_LIVE_MODE` | Only set to `true` when you actually want real calls |

If a real call fails instantly with `11200` / `12100`, it usually means:
- The `outbound-connect` URL is not publicly reachable (ngrok down / wrong `APP_BASE_URL`)
- The Twilio number is not voice-enabled
- The agent/client number is not a verified Caller ID on a trial account

---

## API Reference

### `POST /api/v1/calls/outbound`

Initiates a click-to-call outbound call.

**Auth:** Bearer token (organization scoped)

**Body:**
```json
{
  "clientPhone": "+8801XXXXXXXXX",   // required, E.164
  "agentPhone": "+8801YYYYYYYYY",    // optional, E.164; defaults to org's forwardingNumber
  "contactId": "650f...",            // optional
}
```

**Response (mock mode):**
```json
{
  "success": true,
  "data": {
    "callSid": "dev_1722153600000",
    "status": "INITIATED",
    "from": "+17373855812",
    "to": "+8801XXXXXXXXX",
    "agentPhone": "+8801YYYYYYYYY",
    "record": { "...": "full call_log document" }
  }
}
```

### `GET /api/v1/calls`

Lists the authenticated organization's calls (newest first).

### Webhooks (internal, Twilio-signed)

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/webhooks/twilio/outbound-connect?callSid=...&clientPhone=...` | Returns TwiML that dials the client after the agent answers |
| `POST /api/v1/webhooks/twilio/call-status` | Receives lifecycle events (`ringing`, `in-progress`, `completed`, `failed`, `busy`, `no-answer`, `canceled`) and updates the CallLog |
| `POST /api/v1/webhooks/twilio/dial-status?callSid=...` | Receives Dial verb completion status |
| `POST /api/v1/webhooks/twilio/recording?callSid=...` | Receives recording completion and stores the audio |

---

## Call Status Mapping

| Twilio `CallStatus` | Our `CallStatus` enum |
|---|---|
| `queued`, `initiated` | `INITIATED` |
| `ringing` | `RINGING` |
| `answered`, `in-progress` | `IN_PROGRESS` |
| `completed` | `COMPLETED` |
| `busy` | `BUSY` |
| `no-answer` | `NO_ANSWER` |
| `canceled` / `cancelled` | `CANCELED` |
| `failed` | `FAILED` |

Final statuses (`COMPLETED`, `FAILED`, `BUSY`, `NO_ANSWER`, `CANCELED`)
set `endedAt`.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `404 No active Twilio setting found for this organization` | Call `POST /api/v1/twilio/settings` first with your Twilio number + agent forwarding number |
| `400 agentPhone must be different from clientPhone` | Agent and client numbers must be different |
| `401 Invalid Twilio signature` on webhooks | `APP_BASE_URL` must exactly match the URL Twilio fetches (no trailing space) |
| Mock call SID `dev_...` never becomes live | Set `TWILIO_LIVE_MODE=true` and restart |
| No `outbound-connect` webhook in live mode | The `url` returned by Twilio must be publicly reachable — use ngrok |
| Real call fails instantly | Twilio number must be voice-enabled; trial accounts must verify caller IDs |

---

## Files Modified

| File | Change |
|---|---|
| `src/config/configuration.ts` | Added `twilio.liveMode` config |
| `src/modules/twilio/providers/twilio.provider.ts` | Uses `twilio.liveMode`; added `hangupCall()` |
| `src/modules/twilio/twilio-settings.repository.ts` | Added `findActiveByOrganization()` |
| `src/modules/twilio/twilio-settings.service.ts` | Added `findActiveByOrganization()` |
| `src/modules/twilio/twilio.service.ts` | Replaced `startClickToCall` with `initiateOutboundCall` + `handleOutboundConnect`; implemented `handleCallStatusCallback` |
| `src/modules/twilio/twilio.controller.ts` | Added `outbound-connect` webhook endpoint |
| `src/modules/calls/calls.repository.ts` | Added `findByCallSid`, `upsertOutboundCall`, `updateByCallSid` |
| `src/modules/calls/call-records.service.ts` | Added `recordOutboundCall`, `updateCallStatus` |
| `src/modules/calls/calls.service.ts` | Uses `initiateOutboundCall`; returns full call record |
| `src/modules/calls/dto/create-outbound-call.dto.ts` | Added E.164 validation + optional `agentPhone` |
| `.env` | Added `TWILIO_LIVE_MODE=false` |
| `scripts/test-outbound-call.js` | Automated local mock-mode test |