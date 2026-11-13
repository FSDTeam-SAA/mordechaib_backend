# Frontend Customer Workspace Guide

## Purpose

The customer details page uses one bounded first-paint endpoint. The frontend
must not assemble profile, CRM, task, meeting, call, note, file, commercial,
and insight data through separate initial requests.

```http
GET /api/v1/contacts/{contactId}/workspace
Authorization: Bearer <access-token>
```

Optional limits are `taskLimit`, `meetingLimit`, `callLimit`, `noteLimit`, and
`fileLimit`. Use the dedicated list endpoints only when the user opens a full
section or requests another page.

## Response sections

The response contains:

- `profile`: authoritative customer identity and contact details;
- `capabilities`: whether each top-level action can currently be used;
- `actionContract`: stable execution route, method, required fields, and safe
  customer prefill for each top-level action;
- `crm`: explicitly linked synchronized CRM records;
- `commercial`: grounded deal value, provider probability, and close date;
- `insights`: qualification, persisted customer risk, predicted close, and
  explicit unavailable states;
- `tasks`, `meetings`, `calls`, `health`, `notes`, and `files`: bounded section
  previews.

`AVAILABLE`, `PARTIAL`, and `UNAVAILABLE` are semantic states. Never convert an
unavailable metric to zero and never invent a value in the browser.

## Top-level action contract

Example:

```json
{
  "actionContract": {
    "version": "1.0",
    "actions": {
      "call": {
        "enabled": true,
        "disabledReason": null,
        "method": "POST",
        "path": "/api/v1/calls/outbound",
        "requiredFields": [],
        "prefill": { "contactId": "CONTACT_ID" }
      },
      "email": {
        "enabled": true,
        "disabledReason": null,
        "method": "POST",
        "path": "/api/v1/email/drafts",
        "requiredFields": ["subject", "body"],
        "prefill": {
          "to": ["customer@example.com"],
          "contactIds": ["CONTACT_ID"]
        }
      },
      "scheduleMeeting": {
        "enabled": true,
        "disabledReason": null,
        "method": "POST",
        "path": "/api/v1/meetings",
        "requiredFields": ["platform", "title"],
        "prefill": { "contactIds": ["CONTACT_ID"] }
      },
      "createTask": {
        "enabled": true,
        "disabledReason": null,
        "method": "POST",
        "path": "/api/v1/tasks",
        "requiredFields": ["title"],
        "prefill": { "contactIds": ["CONTACT_ID"] }
      }
    }
  }
}
```

Frontend rules:

1. Disable an action when `enabled` is false and use `disabledReason` for its
   tooltip or accessible explanation.
2. Merge user-entered fields into `prefill`; do not remove `contactId` or
   `contactIds`.
3. The described path is the authoritative existing business endpoint. Do not
   create a second customer-specific execution flow.
4. Creating an email produces a draft. Sending it remains an explicit reviewed
   operation through `POST /api/v1/email/drafts/{draftId}/send`.
5. An archived customer keeps read history visible but every action is
   disabled with `CONTACT_ARCHIVED`.
6. An action can be disabled with `ROLE_NOT_ALLOWED` when the authenticated
   organization role cannot call its authoritative endpoint. In particular,
   the current email-draft workflow is owner-only.

## Detail and pagination routes

```text
GET    /api/v1/contacts/{contactId}/activity
GET    /api/v1/contacts/{contactId}/notes
POST   /api/v1/contacts/{contactId}/notes
PATCH  /api/v1/contacts/{contactId}/notes/{noteId}
DELETE /api/v1/contacts/{contactId}/notes/{noteId}
GET    /api/v1/contacts/{contactId}/files
POST   /api/v1/contacts/{contactId}/files
GET    /api/v1/contacts/{contactId}/files/{fileId}/download
DELETE /api/v1/contacts/{contactId}/files/{fileId}
GET    /api/v1/contacts/{contactId}/crm-links
PUT    /api/v1/contacts/{contactId}/crm-links/{crmRecordId}
DELETE /api/v1/contacts/{contactId}/crm-links/{crmRecordId}
```

Customer files are private. The frontend must request the short-lived download
URL immediately before download or preview and must not persist that URL.

## Commercial and insight integrity

- Deal value is aggregated only when the linked open deals use one currency.
- Multi-currency values remain separate and are never summed.
- Close probability is returned only when the CRM provider supplied an
  explicit probability.
- Customer risk comes from a persisted health snapshot.
- Expansion potential, lifetime value, and next-best action remain
  `UNAVAILABLE` until an authoritative methodology or model exists.
- The frontend must not label deterministic CRM/contact fields as AI output.
