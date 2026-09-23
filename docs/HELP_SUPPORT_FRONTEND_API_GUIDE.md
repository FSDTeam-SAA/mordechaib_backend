# Help & Support Frontend API Guide

Base path: `/api/v1`  
Authentication: `Authorization: Bearer <accessToken>`

All successful JSON responses are wrapped as:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation error",
  "path": "/api/v1/support/requests",
  "timestamp": "2026-09-23T10:00:00.000Z"
}
```

## Screen flow

1. On page load call `GET /support/requests?page=1&limit=20`.
2. Submit the form with `POST /support/requests` as `multipart/form-data`.
3. Refresh the list after a successful submit.
4. When **Details** is clicked, call `GET /support/requests/:requestId`.
5. When **View File** is clicked, call the attachment download endpoint and open the returned short-lived `downloadUrl` immediately.
6. When delete is confirmed, call `DELETE /support/requests/:requestId`, close the modal, and remove/refetch the row.

## Categories and statuses

Categories: `ACCOUNT`, `BILLING`, `TECHNICAL`, `INTEGRATION`, `AI_ASSISTANT`, `FEATURE_REQUEST`, `OTHER`.

Statuses: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.

Suggested labels: `OPEN` → Open, `IN_PROGRESS` → In progress, `RESOLVED` → Resolved, `CLOSED` → Closed.

## Submit a request

`POST /support/requests`

Content-Type must be `multipart/form-data`. Do not manually set its boundary in the browser; pass a `FormData` instance.

Fields:

- `category` — required enum
- `subject` — required, 3–200 characters
- `description` — required plain text, 10–20,000 characters
- `attachments` — optional repeated file field, maximum 5 files; each file must be PDF, JPG/JPEG, or PNG and at most 10 MB

```ts
const form = new FormData();
form.append('category', 'TECHNICAL');
form.append('subject', 'Dashboard report is not loading');
form.append('description', 'The report stays blank after selecting a date range.');
files.forEach((file) => form.append('attachments', file));

await api.post('/api/v1/support/requests', form);
```

Response data:

```json
{
  "id": "66f2d80f6b62081a43c82411",
  "ticketId": "SUP-20260923-A1B2C3D4",
  "organizationId": "66f2d70f6b62081a43c82300",
  "createdByUserId": "66f2d72f6b62081a43c82310",
  "category": "TECHNICAL",
  "subject": "Dashboard report is not loading",
  "description": "The report stays blank after selecting a date range.",
  "status": "OPEN",
  "attachmentCount": 1,
  "attachments": [
    {
      "id": "66f2d82f6b62081a43c82420",
      "originalName": "error.png",
      "mimeType": "image/png",
      "sizeBytes": 152340,
      "createdAt": "2026-09-23T10:00:00.000Z"
    }
  ],
  "createdAt": "2026-09-23T10:00:00.000Z",
  "updatedAt": "2026-09-23T10:00:00.000Z"
}
```

## Recent requests

`GET /support/requests?page=1&limit=20&status=OPEN&category=TECHNICAL`

`status` and `category` are optional. This route always returns only the signed-in user's non-deleted requests in the current organization.

```json
{
  "items": [
    {
      "id": "66f2d80f6b62081a43c82411",
      "ticketId": "SUP-20260923-A1B2C3D4",
      "category": "TECHNICAL",
      "subject": "Dashboard report is not loading",
      "status": "OPEN",
      "attachmentCount": 1,
      "createdAt": "2026-09-23T10:00:00.000Z",
      "updatedAt": "2026-09-23T10:03:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Use `updatedAt` for the UI's **Updated** column. Format it client-side as relative time.

## Request details

`GET /support/requests/:requestId`

Returns the full description and active attachment metadata. It does not expose provider storage keys.

## View or download an attachment

`GET /support/requests/:requestId/attachments/:attachmentId/download?disposition=inline`

- `inline` is suitable for **View File**.
- `attachment` asks the provider to download the file.

```json
{
  "attachmentId": "66f2d82f6b62081a43c82420",
  "originalName": "error.png",
  "mimeType": "image/png",
  "downloadUrl": "https://...signed-url...",
  "expiresAt": "2026-09-23T10:08:00.000Z"
}
```

The URL is private and short-lived. Never persist it; request a new URL each time the user clicks **View File**.

## Delete after confirmation

`DELETE /support/requests/:requestId`

No request body.

```json
{
  "requestId": "66f2d80f6b62081a43c82411",
  "deleted": true,
  "cleanupComplete": true
}
```

Deletion is soft at the database level and private files are cleaned up. A `cleanupComplete: false` result still means the request is deleted from the user's view; storage cleanup was recorded for operational follow-up.

## Platform support staff routes

These routes require `isPlatformAdmin: true`; organization owners/admins cannot use them merely because of their organization role.

- `GET /support/admin/requests` — supports `page`, `limit`, `status`, `category`, `organizationId`, `createdByUserId`, and `search`.
- `GET /support/admin/requests/:requestId`
- `GET /support/admin/requests/:requestId/attachments/:attachmentId/download?disposition=inline`
- `PATCH /support/admin/requests/:requestId/status`

Status update body:

```json
{
  "status": "RESOLVED",
  "resolutionNote": "Configuration corrected and verified with the customer."
}
```

## Frontend rules

- Render `description` as text. Do not inject it with `dangerouslySetInnerHTML`.
- Disable submit while the request is in flight to avoid duplicate tickets.
- Do not send an empty `attachments` string field; append only actual files.
- Treat `404` as inaccessible or deleted; the API intentionally does not reveal another user's ticket.
- Display backend `message` for validation failures, especially file type/size/content mismatch errors.
