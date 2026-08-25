# Meta, Twilio and Calls API Guide

This document is the implementation contract for the following modules:

- `src/modules/meta`
- `src/modules/twilio`
- `src/modules/calls`

## Endpoint summary

| Module | Method | Endpoint | Authentication |
|---|---|---|---|
| Meta | `GET` | `/meta/connect` | Bearer token + organization |
| Meta | `GET` | `/meta/callback` | Public OAuth callback |
| Meta | `GET` | `/meta/connection` | Bearer token + organization |
| Meta | `GET` | `/meta/pages/:pageId/posts` | Bearer token + organization |
| Meta | `GET` | `/meta/pages/:pageId/posts/:postId/comments` | Bearer token + organization |
| Meta | `GET` | `/meta/pages/:pageId/messages` | Bearer token + organization |
| Meta | `GET` | `/meta/pages/:pageId/insights` | Bearer token + organization |
| Meta | `GET` | `/meta/pages/:pageId/overview` | Bearer token + organization |
| Twilio settings | `POST` | `/twilio/settings` | Bearer token + organization |
| Calls | `POST` | `/calls/outbound` | Bearer token + organization |
| Calls | `GET` | `/calls` | Bearer token + organization |
| Twilio webhook | `POST` | `/webhooks/twilio/voice` | Public + Twilio signature |
| Twilio webhook | `POST` | `/webhooks/twilio/outbound-connect` | Public + Twilio signature |
| Twilio webhook | `POST` | `/webhooks/twilio/recording` | Public + Twilio signature |
| Twilio webhook | `POST` | `/webhooks/twilio/dial-status` | Public + Twilio signature |
| Twilio webhook | `POST` | `/webhooks/twilio/call-status` | Public + Twilio signature |

## Base URL and common rules

The default API prefix is `/api/v1`.

```text
http://localhost:5000/api/v1
```

Authenticated endpoints require:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

The organization is taken from the authenticated user. `x-organization-id` is optional; if sent, it must match the user's organization or the API returns `403`.

Normal JSON responses are wrapped by the global interceptor:

```json
{
  "success": true,
  "data": {}
}
```

Errors use this shape:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "...",
  "path": "/api/v1/....",
  "timestamp": "2026-08-20T00:00:00.000Z"
}
```

Phone numbers must be E.164 format, for example `+8801712345678`. Spaces, parentheses and hyphens are stripped before validation.

---

## 1. Meta API

Meta OAuth connects a Facebook/Meta account to the current organization. The OAuth `state` is signed, contains the organization and user IDs, and expires after 10 minutes.

### 1.1 Start Meta connection

```http
GET /api/v1/meta/connect
Authorization: Bearer <access-token>
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://www.facebook.com/v23.0/dialog/oauth?..."
  }
}
```

The frontend should redirect the browser to `data.authorizationUrl`.

### 1.2 OAuth callback

```http
GET /api/v1/meta/callback?code=<meta-code>&state=<signed-state>
```

This endpoint is public because Meta calls it directly. On success the backend exchanges the code, obtains a long-lived token, fetches the organization's pages, encrypts tokens, and stores the integration.

Success response `200`:

```json
{
  "success": true,
  "data": {
    "organizationId": "org_123",
    "provider": "META",
    "status": "CONNECTED",
    "pages": [
      {
        "id": "page_123",
        "name": "Example Page",
        "instagram_business_account": {
          "id": "ig_123",
          "username": "example"
        }
      }
    ]
  }
}
```

Page access tokens are never returned to the client.

If Meta returns an OAuth error, the response is:

```json
{
  "success": true,
  "data": {
    "connected": false,
    "error": "access_denied"
  }
}
```

Missing `code`/`state` returns `400`; invalid or expired state returns `401`.

### 1.3 Get connection status

```http
GET /api/v1/meta/connection
Authorization: Bearer <access-token>
```

Not connected:

```json
{
  "success": true,
  "data": { "connected": false }
}
```

Connected response:

```json
{
  "success": true,
  "data": {
    "connected": true,
    "provider": "META",
    "status": "CONNECTED",
    "expiresAt": "2026-09-01T12:00:00.000Z",
    "metadata": {
      "connectedByUserId": "user_123",
      "pages": [
        { "id": "page_123", "name": "Example Page" }
      ]
    }
  }
}
```

Stored page access tokens are removed from this response.

### 1.4 Read page posts

```http
GET /api/v1/meta/pages/:pageId/posts?limit=25
Authorization: Bearer <access-token>
```

`limit` is optional and defaults to `25`. The response is the Meta Graph list response, normally:

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "page_123_post_1",
        "message": "Hello",
        "created_time": "2026-08-20T10:00:00+0000",
        "permalink_url": "https://facebook.com/..."
      }
    ],
    "paging": { "next": "https://graph.facebook.com/..." }
  }
}
```

### 1.5 Read post comments

```http
GET /api/v1/meta/pages/:pageId/posts/:postId/comments?limit=25
Authorization: Bearer <access-token>
```

`pageId` is used to resolve the organization's stored page token; `postId` is sent to Meta. The response is a Meta list response containing comment objects (`id`, `message`, `created_time`, `like_count`, `from`, `parent`).

### 1.6 Read page messages/conversations

```http
GET /api/v1/meta/pages/:pageId/messages?limit=25
Authorization: Bearer <access-token>
```

Response data contains Meta conversation objects such as `id`, `updated_time`, `unread_count`, `can_reply`, `message_count`, `participants`, and `messages`, plus optional `paging`.

### 1.7 Read page insights

```http
GET /api/v1/meta/pages/:pageId/insights?metrics=page_impressions,page_fans&period=day
Authorization: Bearer <access-token>
```

Both query parameters are optional. The default metrics are `page_impressions`, `page_impressions_unique`, `page_post_engagements`, `page_fans`, and `page_messages_total_count`; the default period is `day`.

Response data is a Meta list response of insight objects:

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "name": "page_impressions",
        "period": "day",
        "values": [{ "value": 1200, "end_time": "2026-08-20T07:00:00+0000" }]
      }
    ]
  }
}
```

### 1.8 Get page overview

```http
GET /api/v1/meta/pages/:pageId/overview?limit=25&metrics=page_fans&period=day
Authorization: Bearer <access-token>
```

Response:

```json
{
  "success": true,
  "data": {
    "page": {
      "id": "page_123",
      "name": "Example Page",
      "instagramBusinessAccount": { "id": "ig_123" }
    },
    "posts": { "data": [] },
    "messages": { "data": [] },
    "insights": { "data": [] }
  }
}
```

The three Meta requests run in parallel. A missing integration returns `404` with `Meta integration is not connected`; an unknown page returns `404` with `Meta page not found`.

---

## 2. Twilio settings API

### Save organization Twilio settings

```http
POST /api/v1/twilio/settings
Authorization: Bearer <access-token>
Content-Type: application/json
```

Request body:

```json
{
  "twilioNumber": "+14155550100",
  "forwardingNumber": "+8801712345678",
  "isRecordingEnabled": true,
  "status": "ACTIVE"
}
```

Fields:

| Field | Required | Notes |
|---|---:|---|
| `twilioNumber` | yes | E.164 Twilio number |
| `forwardingNumber` | yes | E.164 agent/forwarding number; must differ from Twilio number |
| `isRecordingEnabled` | no | Defaults to `true` |
| `status` | no | `ACTIVE` or `INACTIVE`; defaults to `ACTIVE` |

Response `200` returns the saved setting record, for example:

```json
{
  "success": true,
  "data": {
    "organizationId": "org_123",
    "twilioNumber": "+14155550100",
    "forwardingNumber": "+8801712345678",
    "isRecordingEnabled": true,
    "status": "ACTIVE"
  }
}
```

Invalid phone numbers return `400`. A Twilio number owned by another organization returns `409`.

---

## 3. Calls API

### 3.1 Create an outbound click-to-call

```http
POST /api/v1/calls/outbound
Authorization: Bearer <access-token>
Content-Type: application/json
```

Request body:

```json
{
  "clientPhone": "+8801812345678",
  "agentPhone": "+8801712345678",
  "contactId": "crm_contact_123"
}
```

`clientPhone` is required. `agentPhone` is optional and defaults to the organization's configured `forwardingNumber`. `contactId` is accepted by validation but is not currently saved or used by the service.

Response `200`:

```json
{
  "success": true,
  "data": {
    "callSid": "CA123456789",
    "status": "INITIATED",
    "from": "+14155550100",
    "to": "+8801812345678",
    "agentPhone": "+8801712345678",
    "record": {
      "organizationId": "org_123",
      "callSid": "CA123456789",
      "fromNumber": "+14155550100",
      "toNumber": "+8801812345678",
      "twilioNumber": "+14155550100",
      "direction": "OUTBOUND",
      "status": "INITIATED",
      "startedAt": "2026-08-20T10:00:00.000Z"
    }
  }
}
```

When `TWILIO_LIVE_MODE` is not `true`, `callSid` is a locally generated `dev_<timestamp>` SID and no real call is placed. Without an active setting, the API returns `404`; if agent and client numbers are equal, it returns `400`.

### 3.2 List organization calls

```http
GET /api/v1/calls
Authorization: Bearer <access-token>
```

Response `200` is an array sorted newest first:

```json
{
  "success": true,
  "data": [
    {
      "organizationId": "org_123",
      "callSid": "CA123456789",
      "fromNumber": "+14155550100",
      "toNumber": "+8801812345678",
      "direction": "OUTBOUND",
      "status": "COMPLETED",
      "durationSeconds": 142,
      "price": 0.04,
      "priceUnit": "USD",
      "startedAt": "2026-08-20T10:00:00.000Z",
      "endedAt": "2026-08-20T10:02:22.000Z",
      "createdAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:02:22.000Z"
    }
  ]
}
```

---

## 4. Twilio webhooks

All Twilio endpoints are public, skip throttling, and require the `X-Twilio-Signature` header. Twilio sends `application/x-www-form-urlencoded`, not JSON. The backend parses the form body and validates the signature against the exact request URL and raw body.

Webhook base URL:

```text
{APP_BASE_URL}/api/v1/webhooks/twilio
```

Do not call these endpoints from the frontend. Configure them in Twilio and preserve the exact public URL used to generate the signature.

### 4.1 Incoming call: `POST /voice`

Form body minimum:

```text
AccountSid=AC123
CallSid=CA123
From=%2B8801812345678
To=%2B14155550100
CallStatus=ringing
```

Returns raw TwiML with `Content-Type: text/xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" action=".../dial-status?callSid=CA123" method="POST">
    <Number>+8801712345678</Number>
  </Dial>
</Response>
```

If recording is enabled, the `Dial` verb also contains `record="record-from-answer-dual"` and a completed-recording callback. If the destination number is not configured, TwiML says `This phone number is not currently configured.` and hangs up.

### 4.2 Outbound connect: `POST /outbound-connect`

Twilio sends `CallSid` and `From` as form fields. `clientPhone` is required as a query parameter:

```text
POST /api/v1/webhooks/twilio/outbound-connect?clientPhone=%2B8801812345678
```

For local/mock testing, `callSid` may also be supplied as a query parameter; query `callSid` takes precedence over the form field.

Returns raw `text/xml` TwiML that dials `clientPhone`, bridges the agent and client, and optionally enables recording.

### 4.3 Recording callback: `POST /recording`

Optional query parameter: `callSid` (the primary/parent call SID).

Required form fields:

```text
CallSid=CA_provider_leg
RecordingSid=RE123
RecordingUrl=https%3A%2F%2Fapi.twilio.com%2F...
RecordingStatus=completed
```

Optional fields: `RecordingDuration`, `RecordingChannels`.

Response:

```json
{ "success": true, "data": { "received": true } }
```

The backend downloads the recording using Twilio Basic Auth and stores it under `{RECORDING_STORAGE_DIR}/{callSid}/{recordingSid}.wav` (or the detected audio extension). Storage failure is non-fatal; metadata is still persisted and `200` is returned.

### 4.4 Dial status callback: `POST /dial-status`

Optional query parameter: `callSid`. If absent, `CallSid` is required in the form body.

Typical form fields:

```text
CallSid=CA_primary
DialCallSid=CA_dial_leg
DialCallStatus=completed
DialCallDuration=142
```

Response:

```json
{ "success": true, "data": { "received": true } }
```

### 4.5 Call status callback: `POST /call-status`

Required form field: `CallSid`.

Optional fields: `CallStatus`, `CallDuration`, `CallPrice`, `PriceUnit`.

Example:

```text
CallSid=CA123
CallStatus=completed
CallDuration=142
CallPrice=0.04
PriceUnit=USD
```

Response:

```json
{ "success": true, "data": { "received": true } }
```

Twilio statuses are mapped to internal statuses as follows: `queued`/`initiated` -> `INITIATED`, `ringing` -> `RINGING`, `answered`/`in-progress` -> `IN_PROGRESS`, `completed` -> `COMPLETED`, `busy` -> `BUSY`, `no-answer` -> `NO_ANSWER`, `canceled`/`cancelled` -> `CANCELED`, and `failed` -> `FAILED`.

---

## 5. End-to-end call lifecycle

```text
Frontend
  POST /calls/outbound
    -> backend creates first Twilio leg to agent
    -> Twilio POST /webhooks/twilio/outbound-connect
    -> backend returns TwiML dialing the client
    -> Twilio bridges agent + client
    -> Twilio POST /webhooks/twilio/call-status (status updates)
    -> Twilio POST /webhooks/twilio/dial-status (bridge leg result)
    -> Twilio POST /webhooks/twilio/recording (if recording enabled)
  GET /calls
    -> frontend reads the persisted call lifecycle
```

Inbound calls start at `/webhooks/twilio/voice`, are matched by the configured Twilio number, forwarded to `forwardingNumber`, and then follow the dial-status/recording callbacks.

## 6. Implementation checklist

- Use the API envelope `{ success, data }` for normal JSON responses.
- Send Meta and Calls requests with a bearer token; Twilio webhook requests must be signed form posts.
- Configure `APP_BASE_URL` to the publicly reachable HTTPS URL in Twilio/Meta environments.
- Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`.
- Set `TWILIO_LIVE_MODE=true` only when real calls are intended; development defaults to mock calls.
- Configure `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `META_OAUTH_STATE_SECRET`, and an encryption key of at least 32 characters.
- Keep page access tokens and integration tokens server-side; the current API intentionally strips them from responses.
- `contactId` is currently not persisted; add a schema/service field before relying on it in CRM features.
