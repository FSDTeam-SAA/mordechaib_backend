# Calendar Intelligence — AI Backend Handoff

## 1. Purpose

This document defines only the AI Backend work required by the Calendar UI.
The Main Backend remains the source of truth for calendars, meetings, tasks,
permissions, OAuth connections, conflicts, execution, and audit history.

The AI Backend must never create, update, cancel, or send anything directly.
It returns structured recommendations only.

## 2. Already owned by the Main Backend

The AI Backend must not duplicate these responsibilities:

- Google and Outlook OAuth/token refresh.
- External calendar event synchronization.
- Provider event and meeting creation/update/cancellation.
- Date-range calendar feed and status totals.
- Meeting completion derived from the required meeting bot.
- Hard overlap and minimum-buffer conflict detection.
- Upcoming task deadlines and stored reminder counts.
- Approved `CREATE_TASK` and `SCHEDULE_MEETING` execution.
- Organization authorization and tenant isolation.

The Main Backend sends only authorized, organization-scoped facts to the AI
Backend.

## 3. Required new endpoint

### `POST /api/v1/ai/calendar/insights`

Authentication:

```http
x-ai-actions-secret: <AI_SERVICE_SHARED_SECRET>
Content-Type: application/json
```

This is a service-to-service route. It must not accept a frontend JWT.

### Request

```json
{
  "schemaVersion": "1.0",
  "requestId": "calendar-insights-org-1-2026-09-25T00:00:00.000Z",
  "organizationId": "66cc9bdfa847ea856c7b4100",
  "timezone": "Asia/Dhaka",
  "generatedAt": "2026-09-25T00:00:00.000Z",
  "schedulingRequest": {
    "title": "Client review call",
    "durationMinutes": 30,
    "windowStart": "2026-09-26T00:00:00.000Z",
    "windowEnd": "2026-10-03T00:00:00.000Z",
    "participantEmails": ["client@example.com"],
    "preferenceText": "Prefer afternoons and avoid Friday"
  },
  "candidateSlots": [
    {
      "id": "slot-20260927-0900z",
      "startsAt": "2026-09-27T09:00:00.000Z",
      "endsAt": "2026-09-27T09:30:00.000Z",
      "hardConflict": false,
      "bufferSatisfied": true,
      "organizerAvailability": "AVAILABLE",
      "participantAvailability": "UNKNOWN"
    }
  ],
  "meetings": [
    {
      "id": "66cc9bdfa847ea856c7b41d2",
      "title": "Client renewal review",
      "startsAt": "2026-09-27T09:00:00.000Z",
      "endsAt": "2026-09-27T09:30:00.000Z",
      "status": "SCHEDULED",
      "urgency": null,
      "sourceRefs": ["task:66cc9bdfa847ea856c7b41e1"]
    }
  ],
  "facts": {
    "tasks": {
      "availability": "AVAILABLE",
      "items": []
    },
    "sourceAnalyses": {
      "availability": "PARTIAL",
      "items": []
    },
    "customers": {
      "availability": "UNAVAILABLE",
      "items": []
    },
    "crm": {
      "availability": "UNAVAILABLE",
      "items": []
    }
  }
}
```

### Request rules

- `requestId` is the idempotency/correlation identity and must be echoed.
- All datetimes are ISO-8601 instants with `Z` or an explicit UTC offset.
- `timezone` is a valid IANA timezone and must not be replaced with a default.
- Candidate slots are generated and hard-validated by the Main Backend.
- The AI Backend must not invent a slot or alter a supplied slot time.
- A slot with `hardConflict: true` must never be recommended.
- `participantAvailability: UNKNOWN` must not be described as available.
- An `UNAVAILABLE` fact category always has `items: []` and must not be inferred.

### Response

```json
{
  "schemaVersion": "1.0",
  "requestId": "calendar-insights-org-1-2026-09-25T00:00:00.000Z",
  "availability": "PARTIAL",
  "slotRecommendations": [
    {
      "candidateId": "slot-20260927-0900z",
      "rank": 1,
      "preferenceScore": 82,
      "confidence": 0.74,
      "reason": "Matches the stated afternoon preference in Asia/Dhaka; participant availability is unknown.",
      "sourceRefs": []
    }
  ],
  "meetingInsights": [
    {
      "meetingId": "66cc9bdfa847ea856c7b41d2",
      "priority": "HIGH",
      "priorityScore": 88,
      "confidence": 0.84,
      "reason": "The meeting is linked to a high-priority renewal task.",
      "sourceRefs": ["task:66cc9bdfa847ea856c7b41e1"]
    }
  ],
  "warnings": ["Participant availability was not supplied."],
  "model": {
    "provider": "configured-provider",
    "name": "configured-model"
  }
}
```

### Response rules

- `availability` is `AVAILABLE`, `PARTIAL`, or `UNAVAILABLE`.
- `candidateId` must exactly match a supplied candidate.
- `meetingId` must exactly match a supplied meeting.
- `rank` starts at `1` and is unique.
- `preferenceScore` and `priorityScore` are integers from `0` to `100`.
- `confidence` is a number from `0` to `1`.
- Every factual reason must be supported by `sourceRefs` or by an explicit
  scheduling preference in the request.
- `preferenceScore` is semantic preference fit. It is not proof that every
  participant is available.
- When no relevant facts or preferences are supplied, return
  `availability: "UNAVAILABLE"` and empty arrays instead of neutral-looking
  fabricated scores.
- Customer health and CRM claims are forbidden while those categories are
  `UNAVAILABLE`.

## 4. Existing analyze-source extension for post-meeting output

Continue using the existing:

```http
POST /api/v1/ai/jobs/analyze-source
```

for completed Google Meet and Zoom transcripts. Do not add another
post-meeting analysis route.

The existing response fields remain authoritative:

- `analysis.summary` for “Notes Generated”.
- `analysis.classifiedSegments[]` with category `ACTION_ITEM` for detected
  action items.
- `actions[]` with `CREATE_TASK` for review/approval before task creation.

Add this optional non-executable field when a follow-up is justified by the
transcript:

```json
{
  "analysis": {
    "suggestedFollowUpEmail": {
      "to": ["client@example.com"],
      "subject": "Follow-up: Client renewal review",
      "body": "Thank you for the discussion...",
      "confidence": 0.86,
      "evidenceSegmentIds": ["segment-12", "segment-18"]
    }
  }
}
```

Rules:

- This is suggested text only; it is not an executable action.
- The AI Backend must never claim that a draft was saved or an email was sent.
- The Main Backend may create a reviewable draft only after validating the
  recipient and evidence.
- Sending continues to require the owner’s explicit Send action.

## 5. Error contract

Use the existing AI service error envelope:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CALENDAR_INSIGHTS_REQUEST",
    "message": "candidateSlots[0].startsAt must be an ISO-8601 instant"
  }
}
```

Expected statuses:

- `400` malformed or semantically invalid request.
- `401` missing/invalid shared secret.
- `409` reused `requestId` with different content.
- `422` model output failed schema or source-reference validation.
- `503` AI provider unavailable after bounded retries.

## 6. Acceptance checklist

- The same request and `requestId` return an idempotent response.
- A changed request using the same `requestId` returns `409`.
- No output contains an unknown candidate, meeting, or source reference.
- Conflicting candidates are never recommended.
- Unknown participant availability remains explicitly unknown.
- No CRM/customer metric is generated when its fact category is unavailable.
- AI output never performs a calendar, task, CRM, or email mutation.
- Invalid model output returns `422`; it is never silently repaired into a
  misleading response.
