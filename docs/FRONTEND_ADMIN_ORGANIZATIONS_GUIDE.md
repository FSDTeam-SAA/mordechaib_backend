# Platform Admin Organizations Frontend Guide

## Scope

This contract powers the Platform Admin Organizations list, organization detail,
Suspend/Resume action, and Manage Plan modal. Every route requires a bearer
token whose user has `isPlatformAdmin=true`.

Base path:

```text
/api/v1/organizations-admin
```

Successful REST values are wrapped by the standard Main Backend envelope:

```json
{
  "success": true,
  "data": {}
}
```

Examples below describe the value of `data`.

## 1. Organizations list

```http
GET /api/v1/organizations-admin?page=1&limit=20&timezone=Asia%2FDhaka
Authorization: Bearer <platform-admin-token>
```

Optional filters:

- `search`: organization name/email/phone or owner name/email/phone;
- `status`: `ACTIVE | SUSPENDED`;
- `planType`;
- `subscriptionStatus`: raw provider state;
- `subscriptionDisplayStatus`: UI state, including derived `PAUSED`;
- `billingInterval`: `month | year`;
- `timezone`: IANA timezone used for `suspendedToday`;
- `page`, `limit` (`limit` cannot exceed `100`).

Do not send `subscriptionStatus` and `subscriptionDisplayStatus` together. The
backend returns `400` because their semantics are different.

Render the three summary cards from `summary`. Trend values are measured
point-in-time comparisons against seven days earlier; do not calculate them in
the browser.

Use `items[].subscription.displayStatus` for UI badges. A future
`pausedUntil` produces `PAUSED` even when the raw provider status is `ACTIVE`.

## 2. Organization detail

```http
GET /api/v1/organizations-admin/{organizationId}
Authorization: Bearer <platform-admin-token>
```

This single response powers:

- company details and service address;
- owner and member count;
- current subscription presentation;
- Tasks Created, Meetings, Customer Contacts, and ROI Reports cards;
- organization-wide connected tools.

Metric semantics:

- `tasksCreated`: persisted organization tasks;
- `meetings`: platform and synchronized calendar meetings, deduplicated;
- `crmContacts`: active Noltra customer contacts, not raw CRM records;
- `roiReports`: successfully generated ROI PDFs recorded after this tracking
  feature was deployed.

All four metrics are measured and return `availability: "AVAILABLE"`.

### Connected tools

`connectedTools` is organization-scoped. It can detect email accounts connected
by any authorized organization member, not only the owner.

Use:

```json
{
  "summary": {
    "total": 11,
    "connected": 4,
    "attentionRequired": 1,
    "notConfigured": 6
  },
  "items": [
    {
      "provider": "HUBSPOT",
      "label": "HubSpot CRM",
      "connected": true,
      "status": "CONNECTED",
      "canManage": false
    }
  ]
}
```

The Platform Admin screen is read-only for customer integrations. It must not
show a Connect/Reconnect button from this response. OAuth authorization belongs
to the customer organization; `canManage` is therefore always `false` here.

## 3. Manage Plan modal

First load the backend-authoritative catalog:

```http
GET /api/v1/organizations-admin/{organizationId}/plan-options?billingInterval=month
Authorization: Bearer <platform-admin-token>
```

Call it again with `billingInterval=year` when the toggle changes. Do not derive
prices, current state, or button behavior locally.

Render each option using `action`:

| Action              | Frontend behavior                                     |
| ------------------- | ----------------------------------------------------- |
| `CURRENT`           | Selected/disabled; do not call mutation API           |
| `SWITCH`            | Enable the plan switch button                         |
| `CONTACT_SALES`     | Show contact-sales workflow; do not call mutation API |
| `CHECKOUT_REQUIRED` | Explain that customer checkout is required            |
| `UNAVAILABLE`       | Disable for the selected billing interval             |

Only `SWITCH` can call:

```http
PATCH /api/v1/organizations-admin/{organizationId}/subscription
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "planId": "507f1f77bcf86cd799439011",
  "billingInterval": "year"
}
```

On success the response returns the refreshed organization detail plus:

```json
{
  "operation": {
    "type": "PLAN_CHANGE",
    "changed": true,
    "duplicate": false
  }
}
```

A retry that already reached the requested state returns `changed: false` and
`duplicate: true`; treat it as success and replace the local detail state.

## 4. Suspend and resume

Suspend:

```http
PATCH /api/v1/organizations-admin/{organizationId}/status
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "status": "SUSPENDED",
  "reason": "Manual compliance review"
}
```

Resume:

```json
{
  "status": "ACTIVE"
}
```

The response is the refreshed organization detail with:

```json
{
  "operation": {
    "type": "STATUS_UPDATE",
    "changed": true,
    "duplicate": false
  }
}
```

Suspending application access does not silently cancel or pause Stripe billing.
Those are separate business operations.

## 5. Mutation UX and error handling

Disable both status and plan mutation buttons while either action is pending for
the same organization.

| HTTP  | Meaning                                            | Frontend behavior                                                   |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `400` | Invalid plan/action/filter                         | Show backend message and reload plan options                        |
| `401` | Session missing/expired                            | Start authentication flow                                           |
| `403` | Not a Platform Admin                               | Hide screen and show access denied                                  |
| `404` | Organization or plan no longer exists              | Return to list and refetch                                          |
| `409` | Another admin operation is running                 | Keep modal open, wait briefly, refetch detail/options               |
| `503` | Stripe changed but local reconciliation is pending | Do not retry rapidly; show pending-sync state and notify operations |

Never optimistically display a successful plan/status change. Replace frontend
state only with the returned detail response.

## 6. Recommended frontend request sequence

### Initial list

```text
GET organizations-admin
  -> render summary, filters, table, pagination
```

### Detail page

```text
GET organizations-admin/{id}
  -> render profile, subscription, metrics, connected tools
```

### Manage Plan

```text
GET organizations-admin/{id}/plan-options
  -> user selects only an option with action=SWITCH
  -> PATCH organizations-admin/{id}/subscription
  -> replace detail with returned response
  -> optionally refetch plan-options while modal remains open
```

### Suspend/Resume

```text
PATCH organizations-admin/{id}/status
  -> replace detail with returned response
  -> invalidate organizations list cache
```

## 7. Acceptance checklist

- The screen is inaccessible without a Platform Admin token.
- Search is server-side and debounced.
- Summary cards use backend values and timezone.
- Effective subscription status is used for badges.
- Connected tools are not treated as admin-manageable OAuth connections.
- Only plan options with `action=SWITCH` call the mutation route.
- Duplicate successful operations do not show an error.
- `409` triggers refetch instead of an immediate repeated mutation.
- `503` is shown as reconciliation pending, not as a confirmed rollback.
- List cache is invalidated after actual status/plan changes.
