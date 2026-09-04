# Messages module

The Messages module provides one organization-scoped conversation for text and
private file attachments. It is an HTTP transport and persistence layer only.
AI analysis, task creation, streaming, and realtime delivery are intentionally
outside this phase.

## Access model

- Every authenticated organization member can read the organization's
  conversation and messages.
- `OWNER`, `ADMIN`, and `MEMBER` can send messages and upload attachments.
- `VIEWER` is read-only.
- A message can be deleted by its creator, an `OWNER`, or an `ADMIN`.
- All message and attachment lookups include `organizationId`; a URL or MongoDB
  ID alone never grants access.

## Storage setup

Set either `CLOUDINARY_URL` or all three explicit Cloudinary credentials:

```env
CLOUDINARY_URL=cloudinary://api-key:api-secret@cloud-name

# Or use these instead of CLOUDINARY_URL:
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

CLOUDINARY_MESSAGE_FOLDER=noltra/messages
CLOUDINARY_DOWNLOAD_URL_TTL_SECONDS=300
```

Attachments are uploaded using Cloudinary's `authenticated` delivery type.
API responses never expose Cloudinary public IDs, asset IDs, or provider
credentials. A member must request a short-lived, signed URL through the
download endpoint.

The domain service depends on `MessageAttachmentStorage`, not Cloudinary
directly. A future S3 adapter can implement the same interface and replace the
module provider without changing controllers, message persistence, or access
rules.

## Routes

All routes use the global `/api/v1` prefix and require a bearer token.

| Method   | Route                                                            | Purpose                                                                 |
| -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET`    | `/api/v1/messages/conversation`                                  | Get the organization's conversation, or `null` before its first message |
| `POST`   | `/api/v1/messages`                                               | Send text, files, or both as `multipart/form-data`                      |
| `GET`    | `/api/v1/messages?page=1&limit=30`                               | Get paginated messages, newest first                                    |
| `GET`    | `/api/v1/messages/:messageId`                                    | Get one active message and its attachment metadata                      |
| `GET`    | `/api/v1/messages/:messageId/attachments/:attachmentId/download` | Get an authorized short-lived file URL                                  |
| `DELETE` | `/api/v1/messages/:messageId`                                    | Soft-delete the message and delete stored attachments                   |

### Send a message

Use `application/json` for a text-only message:

```json
{
  "content": "Good morning"
}
```

Use `multipart/form-data` for an attachment-only or mixed message:

```bash
curl -X POST "http://localhost:5000/api/v1/messages" \
  -H "Authorization: Bearer <access-token>" \
  -F "clientMessageId=95d60788-6bcb-4c7c-aed0-3791df5fd1f7" \
  -F "content=Please analyze these files later" \
  -F "files=@./photo.jpg" \
  -F "files=@./report.pdf"
```

`clientMessageId` is an optional client-generated UUID. Reusing it safely
returns the already-created message, which protects against retries and double
clicks. Omit the field completely when the frontend does not implement retry
keys yet; an empty multipart field is also treated as omitted.

The `files` form-data key must use the client's **File** or **binary** type, not
Text. Repeat the same `files` key to upload multiple attachments.

At least one non-empty `content` value or one file is required. A request can
contain no more than 10 attachments.

### Attachment rules

| Category | Extensions                                                       | Maximum per file |
| -------- | ---------------------------------------------------------------- | ---------------: |
| Image    | `jpg`, `jpeg`, `png`, `gif`, `webp`, `heic`                      |            20 MB |
| PDF      | `pdf`                                                            |            20 MB |
| Document | `txt`, `csv`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `rtf` |            20 MB |
| Audio    | `mp3`, `wav`, `ogg`, `m4a`, `aac`, `flac`, `webm`                |            50 MB |
| Video    | `mp4`, `mov`, `webm`, `mpeg`, `mpg`, `avi`                       |           200 MB |

Both the filename extension and MIME category are validated. Files are first
written to a dedicated operating-system temporary directory so a 200 MB video
does not occupy application memory. The temporary file is removed after the
request succeeds or fails. Files over 100 MB use Cloudinary's chunked upload.

### Download an attachment

```http
GET /api/v1/messages/{messageId}/attachments/{attachmentId}/download?disposition=inline
```

`disposition` is either `inline` (default) or `attachment`. The response
contains `downloadUrl` and `expiresAt`; the URL should not be persisted by the
frontend because it expires.

### Delete and retry cleanup

Deletion immediately hides the message from reads, then removes every stored
attachment. If Cloudinary is temporarily unavailable, the response reports
`cleanupComplete: false` and the attachment remains in `DELETE_FAILED` state.
Repeating the same `DELETE` route retries only unfinished attachment cleanup.

## Persistence and future AI processing

The module adds three collections:

- `conversations`: one unique record per organization.
- `messages`: sender, text, idempotency key, attachment count, and processing
  state.
- `message_attachments`: safe metadata, checksum, private storage references,
  cleanup state, and future extraction/transcription state.

Messages and attachments start with `processingStatus=NOT_REQUESTED`. A later AI
worker can transition them through `PENDING`, `PROCESSING`, `COMPLETED`, or
`FAILED`, store extracted text/transcription, and create tasks while keeping the
HTTP/storage design unchanged.

## Production follow-ups

- Add file-signature/malware scanning before allowing AI ingestion.
- Add a scheduled cleanup worker for attachments left in `DELETE_FAILED`.
- Add an organization retention policy and audit events if compliance requires
  them.
- Add S3-compatible storage by implementing `MessageAttachmentStorage` and
  swapping the dependency-injection binding.
