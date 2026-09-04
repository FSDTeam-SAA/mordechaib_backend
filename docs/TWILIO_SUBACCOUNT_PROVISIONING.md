# Managed Twilio subaccount provisioning

This feature is entered from the authenticated dashboard Settings area. It is
not part of registration or organization onboarding. The existing organization
created at registration is reused.

## Access and scope

- Only an organization `OWNER` can search numbers, provision or retry a
  connection, change its forwarding number, view usage, or close it.
- Search is limited to local, voice-enabled numbers in `US`, `GB`, and `FR`.
- SMS webhook configuration and AI voice agents are intentionally outside this
  phase.
- Number rental is included in the platform subscription and is not returned as
  a separate customer-facing price.
- Subaccount auth tokens are encrypted at rest and are never returned by an API.

## API contract

All paths use the application's `/api/v1` prefix and require an authenticated
owner in the current organization.

| Method  | Path                                   | Purpose                                                      |
| ------- | -------------------------------------- | ------------------------------------------------------------ |
| `GET`   | `/twilio/connection`                   | Current connection, step, safe failure, and retention status |
| `GET`   | `/twilio/numbers/available`            | Search available local voice numbers                         |
| `POST`  | `/twilio/connection`                   | Start background provisioning                                |
| `POST`  | `/twilio/connection/retry`             | Continue a failed or suspended operation                     |
| `PATCH` | `/twilio/connection/forwarding-number` | Change the forwarding/agent phone                            |
| `POST`  | `/twilio/connection/close`             | Permanently release the number and close the subaccount      |
| `GET`   | `/twilio/usage`                        | Current included minutes, overage, and spending limit        |

Number search accepts `country`, optional `areaCode` for the US, `locality`,
`region`, `contains`, and a result `limit` from 1 through 20. Search results
contain the number, location, regulatory address requirement, and capabilities;
they do not contain a rental price.

Provisioning accepts the selected E.164 `phoneNumber`, `country`, E.164
`forwardingNumber`, and optional `isRecordingEnabled`. A search result is not a
reservation. If Twilio reports it unavailable during purchase, the connection
ends in `FAILED`; the UI should show the safe failure and let the owner search
and choose again when no number was purchased.

Closing requires `{ "confirmClose": true }`. This explicit owner action has no
retention delay and cannot be undone at Twilio.

## State machine and retries

The persisted state flow is:

`CREATING_SUBACCOUNT -> PURCHASING_NUMBER -> CONFIGURING_VOICE -> ACTIVATING -> ACTIVE`

Failures store `FAILED`, the provider/error code when available, a bounded safe
message, the operation id, and retry count. Jobs use an operation id so stale
workers cannot continue a superseded retry.

Retries resume from durable Twilio identifiers:

- Before creating a subaccount, the worker searches for the deterministic
  organization-friendly name to recover a Twilio success whose response was
  not saved.
- If a subaccount SID and encrypted token exist, creation is skipped.
- Before purchasing, the worker checks both the local number record and the
  subaccount's Twilio-owned numbers.
- If the number exists but the voice URL is missing or different, only webhook
  configuration is repeated.
- If every resource is already configured, activation is idempotent.

A provisioning failure never releases a successfully purchased number.

## Existing calling integration

The existing voice webhook, forwarding, outbound two-leg call flow, status
callbacks, recordings, and call logs remain the calling implementation. Managed
organizations now execute Twilio REST operations with their own subaccount
credentials. Legacy organizations without a managed record continue using the
parent credentials and existing settings.

Webhook signatures are selected using the incoming `AccountSid`: a known
subaccount is validated with its encrypted token; legacy parent traffic uses the
parent token. Incoming account ownership is also compared with the organization
that owns the called number.

## Subscription and usage lifecycle

- Provisioning and outgoing calls require an active/trialing, unpaused
  subscription with calling minutes, plus an active organization.
- For temporary non-production testing only, set
  `TWILIO_SUBSCRIPTION_ENFORCEMENT_ENABLED=false`. This bypasses Twilio
  subscription eligibility and overage billing while preserving organization,
  authorization, destination, and usage-recording controls. Production startup
  rejects this setting; restore it to `true` before deployment.
- Completed Twilio dial callbacks are deduplicated by Call SID and accumulated
  in the current subscription period.
- The subscription snapshot provides included minutes (for example 100) and
  its extra-minute rate. Only the portion beyond the allowance becomes a Stripe
  invoice item. The Call SID is the Stripe idempotency key.
- Destination prefixes are restricted by configuration, and outgoing calls are
  blocked when the period overage reaches the configured spending cap.
- Past-due or paused subscriptions suspend the subaccount and deactivate the
  local connection without releasing its number.
- Restoring an active subscription reactivates the same subaccount and number.
- When Stripe reaches `CANCELED` at the end of the paid period, the connection
  stays suspended for the configured retention window. The owner is notified,
  and a delayed job releases the number and closes the subaccount. Reactivation
  changes the operation id, making that delayed closure harmless.
- Internal call logs and downloaded recording files are not deleted when a
  number or subaccount is closed.

## Required configuration

```dotenv
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace-with-parent-auth-token
TWILIO_LIVE_MODE=true
TWILIO_ALLOWED_CALL_PREFIXES=+1,+33,+44
TWILIO_MAX_OVERAGE_USD_PER_PERIOD=100
TWILIO_NUMBER_RETENTION_DAYS=30
TWILIO_UNUSUAL_CALL_MINUTES=60
INTEGRATION_ENCRYPTION_KEY=replace-with-at-least-32-random-characters
APP_BASE_URL=https://api.example.com
```

Live production mode requires a valid parent Account SID, an auth token, a
minimum 32-character encryption key, and an HTTPS public origin. Redis is
required for provisioning, closure, and overage billing jobs. The Stripe
customer attached to the subscription is charged through its normal invoice and
saved payment method.

At 80% of included usage, at 80% of the configured overage cap, or when a
single call crosses the unusual-duration threshold, the owner receives a
once-per-period warning. Alert claims are persisted so repeated callbacks do
not send duplicate messages.

UK and France inventory can carry regulatory address or bundle requirements.
Those requirements are returned by search and Twilio may reject purchase until
the organization's applicable regulatory documents have been approved. The
regulatory bundle submission workflow should be completed before enabling such
numbers for production customers that require it.
