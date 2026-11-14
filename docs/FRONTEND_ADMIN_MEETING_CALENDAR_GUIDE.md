# Platform Admin Meeting Calendar Frontend Guide

## Scope

This contract powers only the Platform Admin Meeting Calendar. All routes
require a bearer token whose user has `isPlatformAdmin=true`.

Base path:

```text
/api/v1/platform/meeting-calendar
```

Like the other Main Backend REST APIs, every successful payload shown below is
returned inside the standard envelope:

```json
{
  "success": true,
  "data": {}
}
```

The examples below show the value of `data` so the calendar contract remains
easy to read.

Do not call organization-scoped `/calendar` or `/meetings` routes from this
screen. Do not derive action availability in the browser; use the capability
flags returned by the dashboard.

## 1. Load the calendar

```http
GET /api/v1/platform/meeting-calendar
  ?from=2026-11-01T00:00:00.000Z
  &to=2026-12-01T00:00:00.000Z
  &timezone=Asia%2FDhaka
  &page=1
  &limit=50
Authorization: Bearer <platform-admin-token>
```

Required query fields:

- `from`: inclusive ISO-8601 instant;
- `to`: exclusive ISO-8601 instant;
- `timezone`: valid IANA timezone.

Optional filters:

- `organizationId`;
- `status`: `PENDING | CONFIRMED | COMPLETED | CANCELLED | FAILED`;
- `sourceType`: `PLATFORM_MEETING | CALENDAR_EVENT`;
- `meetingType`;
- `search`: title, participant email, or organization name;
- `page`, `limit` (`limit` cannot exceed `100`).

The requested range cannot exceed 366 days.

Response sections:

```json
{
  "asOf": "2026-11-14T06:00:00.000Z",
  "timezone": "Asia/Dhaka",
  "range": {
    "from": "2026-11-01T00:00:00.000Z",
    "to": "2026-12-01T00:00:00.000Z"
  },
  "summary": {
    "total": 50,
    "pending": 5,
    "confirmed": 20,
    "completed": 18,
    "cancelled": 7,
    "failed": 2
  },
  "meetingTypes": [],
  "items": [],
  "upcoming": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 50,
    "pages": 1
  }
}
```

Summary cards are independent of the `status` filter. Search, organization,
source type, meeting type, and date range still scope the summary.

## 2. Calendar item identity and actions

Always retain both `item.id` and `item.sourceType`. IDs cannot be safely used
without their source type.

```json
{
  "id": "66cc9bdfa847ea856c7b41d2",
  "sourceType": "PLATFORM_MEETING",
  "organization": {
    "id": "66cc9bdfa847ea856c7b4101",
    "name": "Acme Ltd"
  },
  "status": "CONFIRMED",
  "canComplete": false,
  "canCancel": true,
  "canDelete": false
}
```

Render action buttons only from these flags:

- `canComplete=true`: enable Complete;
- `canCancel=true`: enable Cancel;
- `canDelete=true`: enable permanent Delete.

The backend revalidates every transition. A stale screen can therefore receive
`409`; refetch the dashboard after that response.

### Complete

```http
POST /api/v1/platform/meeting-calendar/PLATFORM_MEETING/{id}/complete
Authorization: Bearer <platform-admin-token>
```

### Cancel

```http
POST /api/v1/platform/meeting-calendar/{sourceType}/{id}/cancel
Authorization: Bearer <platform-admin-token>
```

Cancellation is provider-backed. Do not optimistically remove the item before
the API succeeds.

### Permanently delete

```http
DELETE /api/v1/platform/meeting-calendar/PLATFORM_MEETING/{id}
Authorization: Bearer <platform-admin-token>
```

Only terminal platform meetings are deletable. Synchronized provider-only
calendar events are retained for synchronization integrity.

Successful action response:

```json
{
  "id": "66cc9bdfa847ea856c7b41d2",
  "sourceType": "PLATFORM_MEETING",
  "organizationId": "66cc9bdfa847ea856c7b4101",
  "action": "CANCEL",
  "status": "CANCELLED",
  "changedAt": "2026-11-14T06:10:00.000Z"
}
```

Refetch the current dashboard range after every successful action.

## 3. Schedule a meeting

The organization selector and organizer selector are mandatory. The organizer
must be an active `OWNER` or `ADMIN` in the selected organization.

```http
POST /api/v1/platform/meeting-calendar/meetings
Authorization: Bearer <platform-admin-token>
Content-Type: application/json
```

```json
{
  "organizationId": "66cc9bdfa847ea856c7b4101",
  "organizerUserId": "66cc9bdfa847ea856c7b4102",
  "platform": "GOOGLE_MEET",
  "title": "Customer project review",
  "agenda": "Review delivery progress and next steps",
  "startsAt": "2026-11-20T09:00:00.000Z",
  "durationMinutes": 30,
  "timezone": "Asia/Dhaka",
  "invitees": ["customer@example.com"],
  "contactIds": [],
  "reminderMinutesBeforeStart": 15,
  "sendBot": true,
  "idempotencyKey": "admin-meeting-01JCC5Y6D0VJ8H7AM6XZ"
}
```

Generate one stable `idempotencyKey` when the form is submitted. Reuse the
same key for network retries of the same request. Generate a new key only after
the user changes the intended meeting or starts a new submission.

On `201`, close the modal and refetch the dashboard. A duplicate retry can
return the existing meeting with `duplicate=true`.

## 4. Synchronize connected calendars

```http
POST /api/v1/platform/meeting-calendar/sync
Authorization: Bearer <platform-admin-token>
Content-Type: application/json
```

```json
{
  "organizationId": "66cc9bdfa847ea856c7b4101",
  "organizerUserId": "66cc9bdfa847ea856c7b4102",
  "provider": "GOOGLE_CALENDAR",
  "from": "2026-11-01T00:00:00.000Z",
  "to": "2026-12-01T00:00:00.000Z"
}
```

Omit `provider` to synchronize every connected Google/Outlook provider. Omit
the range to use backend defaults. Disable the organization's Sync button while
the request is active.

- `AVAILABLE`: all selected providers synchronized;
- `PARTIAL`: at least one provider synchronized and at least one failed;
- `503`: none could be synchronized.

Refetch the dashboard on both `AVAILABLE` and `PARTIAL`.

## 5. Error handling

| Status | Frontend behavior                                                          |
| ------ | -------------------------------------------------------------------------- |
| `400`  | Show field/range validation feedback.                                      |
| `401`  | Refresh authentication or redirect to login.                               |
| `403`  | Hide the Platform Admin screen and show access denied.                     |
| `404`  | Show a generic unavailable message and refetch.                            |
| `409`  | Another operation is running or state changed; keep UI stable and refetch. |
| `503`  | Provider is unavailable; show retry guidance without changing local state. |

Never expose provider tokens, internal failure stacks, or organization data
from a previous filter selection. Cancel in-flight list requests when filters
change, and apply only the latest response.

## 6. Recommended frontend state flow

```text
set filters/range
  -> request dashboard
  -> render summary + calendar + table from one response
  -> execute one capability-backed action
  -> wait for success
  -> refetch the same dashboard query
```

Do not merge this response with organization-scoped calendar APIs in the
browser. The platform endpoint already performs cross-organization
deduplication and organization joins.

## 7. End-to-end acceptance sequence

Run this sequence in a non-production organization that has a connected Zoom,
Google, or Outlook integration:

1. Load a bounded calendar range and retain its `summary.total`.
2. Schedule a future meeting with a new idempotency key; expect `201`.
3. Retry the identical request with the same key; expect the same meeting ID
   and `duplicate=true`.
4. Refetch the calendar and confirm the meeting appears once with the target
   organization and valid capability flags.
5. Cancel the meeting; expect `200` and `status=CANCELLED`.
6. Refetch and confirm summary/list state changed without a duplicate item.
7. Delete that terminal platform meeting; expect `200` and `deleted=true`.
8. Run organization calendar sync, then refetch and confirm provider events
   are deduplicated against linked platform meetings.
9. Repeat an action concurrently from two browser tabs; one request may
   succeed while the other receives `409`, and the final persisted state must
   remain consistent.
10. Verify a normal organization admin token receives `403` for every route.

Treat the backend response after each refetch as authoritative; the frontend
must not manufacture a terminal status after a provider or concurrency error.
