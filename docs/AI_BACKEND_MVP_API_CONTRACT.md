# AI Backend MVP API Contract

## Purpose

This is the final handoff for the current Main Backend and AI Backend meeting/call analysis MVP. It is based on the Main Backend ai-integration, ai-actions and meeting-bot implementation, plus the supplied AI service route documents.

Required ownership:

~~~text
Transcript complete
 -> Main Backend queue
 -> AI Backend returns analysis JSON
 -> Main Backend stores drafts/proposals
 -> Frontend CEO clarification or approval
 -> Main Backend executes Task/Meeting
~~~

AI Backend must never create a Main Backend Task, Meeting, Calendar event, CRM record, approval, or proposal. It returns JSON only.

## Readiness verdict

The Main Backend integration is structurally ready, but the supplied AI route contract is not compatible yet.

| Priority | AI Backend change |
| --- | --- |
| Blocker | Update /api/v1/ai/jobs/analyze-source to return top-level requestId and actions. |
| Blocker | Remove submitted_proposals and all Main Backend write callbacks. |
| Blocker | Accept and analyze inline context. |
| Blocker | Add /api/v1/ai/actions/refine. |
| Blocker | Emit only CREATE_TASK and SCHEDULE_MEETING actions in this MVP. |
| Required | Use strict ISO-8601 datetimes or ask clarification. |
| Required | Preserve actionId and action type during refinement. |
| Optional later | Add execution-result feedback from Main Backend to AI Backend. |

## Authentication

Both gateway routes are called by Main Backend with:

~~~http
x-ai-actions-secret: <AI_SERVICE_SHARED_SECRET>
Content-Type: application/json
~~~

The value must be identical in both deployments. These routes do not use frontend JWTs. AI Backend must reject a missing or incorrect secret.

## Main Backend wire conventions

Main Backend sends these source types:

~~~text
CALL_AUDIO
CALL_TRANSCRIPT
ZOOM_MEETING
GOOGLE_MEET
USER_MESSAGE
~~~

For a Google Meet or Zoom transcript, source.id is the Main Backend Meeting Bot MongoDB document ID. It is not the provider meeting number, provider event ID, Recall recording ID, or transcript ID.

Main Backend creates a deterministic job identifier:

~~~text
requestId = source-{sourceType lowercase}-{sourceId}
~~~

AI Backend should echo the request jobId as response requestId.

### Agent identity

The current Main Backend proposal schema uses:

~~~json
{
  "id": "operations-agent",
  "name": "Layla",
  "type": "OPERATIONS"
}
~~~

id is the stable agent identifier, name is the display name, and type is the
agent category persisted with every proposal and executed resource. For direct
MVP compatibility, send the wire key id (not agentId). Valid types are SALES,
OPERATIONS, SUPPORT, MARKETING, STRATEGY, DESIGN, and CUSTOM.

## 1. Analyze source

### Route

~~~http
POST {AI_SERVICE_URL}/api/v1/ai/jobs/analyze-source
~~~

The route already exists in the AI documentation, but its request handling and response must follow this document.

### Request

~~~json
{
  "schemaVersion": "1.0",
  "jobId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "idempotencyKey": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "organizationId": "66cc9bdfa847ea856c7b41d1",
  "agent": {
    "id": "operations-agent",
    "name": "Operations Agent",
    "type": "OPERATIONS"
  },
  "source": {
    "type": "ZOOM_MEETING",
    "id": "66cc9bdfa847ea856c7b41d2"
  },
  "context": {
    "organizationId": "66cc9bdfa847ea856c7b41d1",
    "source": {
      "type": "ZOOM_MEETING",
      "id": "66cc9bdfa847ea856c7b41d2"
    },
    "occurredAt": "2026-09-10T09:30:00.000Z",
    "organization": {
      "organizationId": "66cc9bdfa847ea856c7b41d1",
      "name": "Example Ltd.",
      "timezone": "Asia/Dhaka",
      "language": "en",
      "industry": "Software",
      "businessSize": "SMALL",
      "businessHours": {}
    },
    "meeting": {
      "platform": "ZOOM",
      "participants": ["Customer", "Account Executive"],
      "transcriptAvailable": true
    },
    "transcript": {
      "text": "Customer: Please send the revised proposal tomorrow.",
      "segments": [],
      "wordCount": 8,
      "languageCode": "auto"
    }
  },
  "generatedAt": "2026-09-10T10:00:00.000Z"
}
~~~

context is bounded data prepared by Main Backend. AI must use it directly and must not call a removed Main Backend context route or request provider credentials.

For `USER_MESSAGE`, the context also contains a bounded conversation history,
active pending proposals, and attachment metadata. Message attachment entries
may include a short-lived `downloadUrl` (typically five minutes). The AI
service may fetch that URL during the request to transcribe audio or extract
PDF/document content; it must not persist or expose the URL. If the AI service
cannot process an attachment, it should return a clarification action rather
than guessing.

### Required response

Return raw JSON, not a success/data envelope.

~~~json
{
  "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "source": {
    "type": "ZOOM_MEETING",
    "id": "66cc9bdfa847ea856c7b41d2"
  },
  "actions": [
    {
      "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-task-001",
      "actionType": "CREATE_TASK",
      "proposedByAgent": {
        "id": "operations-agent",
        "name": "Layla",
        "type": "OPERATIONS"
      },
      "payload": {
        "title": "Send revised proposal",
        "description": "Send the revised proposal to the customer.",
        "priority": "HIGH",
        "dueDate": "2026-09-11T10:00:00.000Z",
        "tags": ["follow-up", "quotation"]
      },
      "confidence": 0.94,
      "riskLevel": "MEDIUM",
      "evidence": [
        {
          "text": "Customer: Please send the revised proposal tomorrow.",
          "speaker": "Customer",
          "startTimeSeconds": 120,
          "endTimeSeconds": 126
        }
      ]
    },
    {
      "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-meeting-001",
      "actionType": "SCHEDULE_MEETING",
      "proposedByAgent": {
        "id": "operations-agent",
        "name": "Layla",
        "type": "OPERATIONS"
      },
      "payload": {
        "platform": "ZOOM",
        "title": "Project follow-up meeting",
        "agenda": "Review the quotation and project next steps.",
        "startsAt": "2026-09-15T15:00:00.000Z",
        "durationMinutes": 30,
        "timezone": "Asia/Dhaka",
        "invitees": [],
        "reminderMinutesBeforeStart": 15,
        "sendBot": true
      },
      "confidence": 0.88,
      "evidence": []
    }
  ],
  "analysis": {
    "sentimentAnalysis": {
      "score": {
        "positive": 40,
        "neutral": 50,
        "negative": 10
      }
    },
    "customerIntelligence": {
      "healthScore": 80,
      "riskLevel": "LOW"
    },
    "patternDetection": {
      "followUpRequests": 80
    }
  }
}
~~~

analysis is required for this MVP. Main Backend stores the normalized analysis
snapshot inside every proposal created from this source, so the frontend can
read sentiment, customer intelligence, and pattern detection from the normal
proposal detail/list response. When multiple actions are returned, the same
source-level snapshot is intentionally copied to each proposal for simple MVP
queries; a separate analysis-run collection can be introduced later if needed.

The required analysis shape is:

~~~json
{
  "sentimentAnalysis": {
    "score": { "positive": 40, "neutral": 50, "negative": 10 }
  },
  "customerIntelligence": {
    "healthScore": 80,
    "riskLevel": "LOW"
  },
  "patternDetection": {
    "valueProposition": 0,
    "pricingObjection": 0,
    "budgetApproval": 0,
    "marketTrends": 0,
    "followUpRequests": 80
  }
}
~~~

All scores are numbers from 0 to 100. Main Backend normalizes
customerIntelligence.riskLevel to uppercase before persistence.

### Action rules

| Field | Rule |
| --- | --- |
| requestId | Echo request jobId; max 200 characters. |
| source | Echo source type and ID. |
| actions | Each item becomes one independent proposal. |
| actionId | Required, unique within requestId, stable on retry. |
| actionType | Only CREATE_TASK or SCHEDULE_MEETING. |
| proposedByAgent.id | Stable ID, for example operations-agent. |
| proposedByAgent.name | Display name, for example Layla. |
| proposedByAgent.type | Required category: SALES, OPERATIONS, SUPPORT, MARKETING, STRATEGY, DESIGN, or CUSTOM. |
| payload | JSON object validated by Main Backend. |
| confidence | Number from 0 to 1. |
| evidence | Optional; each item requires text. |
| clarificationQuestions | Optional; maximum 10 unique questions. |

If clarificationQuestions is present, Main Backend stores NEEDS_CLARIFICATION; otherwise it validates the payload and stores PENDING.

### Multiple actions

Five AI actions produce five independent proposals:

~~~text
proposalId = requestId + ":" + actionId
~~~

Each can be separately tracked, clarified, approved, rejected, executed, or failed. The MVP has no bulk approval route.

## 2. Action payload rules

### CREATE_TASK

payload.title is required. Supported optional fields:

~~~text
description, assignedToUserId, department, priority, dueDate,
estimatedDurationMinutes, stakeholderIds, dependencies, requiredAttachments,
reminder, subtasks, tags
~~~

Use priority values LOW, MEDIUM, HIGH; department values SALES, FINANCE, OPERATIONS, SUPPORT, DESIGN, MARKETING, OTHER. dueDate must be strict ISO-8601.

### SCHEDULE_MEETING

A ready meeting requires:

~~~json
{
  "platform": "GOOGLE_MEET",
  "title": "Project review",
  "startsAt": "2026-09-15T15:00:00.000Z",
  "durationMinutes": 30,
  "timezone": "Asia/Dhaka",
  "invitees": [],
  "sendBot": true
}
~~~

platform must be ZOOM or GOOGLE_MEET. Never send September 15, tomorrow, or 3 PM as startsAt. If date, time, or timezone is ambiguous, return a clarification question.

## 3. Missing clarification route

### Route to add in AI Backend

~~~http
POST {AI_SERVICE_URL}/api/v1/ai/actions/refine
~~~

Main Backend calls it after the CEO submits:

~~~http
POST /api/v1/ai-actions/proposals/:id/clarifications
~~~

Request:

~~~json
{
  "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "proposal": {
    "id": "66dd9bdfa847ea856c7b41d2",
    "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "operations-agent",
      "name": "Layla",
      "type": "OPERATIONS"
    },
    "source": {
      "type": "ZOOM_MEETING",
      "id": "66cc9bdfa847ea856c7b41d2"
    },
    "payload": {
      "platform": "ZOOM",
      "title": "Project follow-up meeting",
      "timezone": "Asia/Dhaka"
    },
    "clarificationQuestions": [
      {
        "id": "meeting-start-time",
        "field": "startsAt",
        "question": "What time should the meeting start?",
        "inputType": "TIME",
        "required": true
      }
    ],
    "clarificationAnswers": {
      "meeting-start-time": "3:00 PM"
    }
  },
  "clarification": {
    "questionId": "meeting-start-time",
    "answer": "3:00 PM"
  }
}
~~~

Response:

~~~json
{
  "action": {
    "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-meeting-001",
    "actionType": "SCHEDULE_MEETING",
    "proposedByAgent": {
      "id": "operations-agent",
      "name": "Layla",
      "type": "OPERATIONS"
    },
    "payload": {
      "platform": "ZOOM",
      "title": "Project follow-up meeting",
      "startsAt": "2026-09-15T15:00:00.000Z",
      "durationMinutes": 30,
      "timezone": "Asia/Dhaka",
      "invitees": [],
      "sendBot": true
    },
    "confidence": 0.91,
    "evidence": []
  }
}
~~~

The refined action must preserve the original actionId and actionType. It may return another clarification list if the answer is still incomplete. Otherwise Main Backend moves the proposal to PENDING.

## 4. Legacy routes and fields

| Legacy item | Decision |
| --- | --- |
| POST /api/v1/recordings/analyze | Keep only for manual/debug analysis; it is not consumed by Main Backend. |
| analysis.tasks | Legacy shape; convert to actions. |
| submitted_proposals | Remove; it belongs to the callback design. |
| backend_result | Remove; AI must not execute Main Backend effects. |
| email.draft_message / follow_up_email | Narrative only in this MVP. |
| CRM actions | Not supported in this MVP. |
| Chief-of-Staff routes | Separate feature; not required for meeting proposal E2E. |
| Heartbeat/job-event routes | Optional observability; Main Backend does not consume them. |

## 5. Main Backend frontend lifecycle

Frontend calls Main Backend, not AI Backend:

~~~text
GET  /api/v1/ai-actions/proposals?status=NEEDS_CLARIFICATION
GET  /api/v1/ai-actions/proposals/:id
POST /api/v1/ai-actions/proposals/:id/clarifications
GET  /api/v1/ai-actions/proposals?status=PENDING
POST /api/v1/ai-actions/proposals/:id/approve
POST /api/v1/ai-actions/proposals/:id/reject
~~~

Lifecycle:

~~~text
complete:   PENDING -> APPROVED -> EXECUTING -> EXECUTED
incomplete: NEEDS_CLARIFICATION -> ANALYZING -> PENDING
             -> NEEDS_CLARIFICATION (if still incomplete)
~~~

Only Main Backend approval creates the Task or provider Meeting. The approving CEO/Admin is the creator of the resulting resource.

## 6. Optional execution-result route

Not currently called by Main Backend and not required for first E2E draft/approval testing:

~~~http
POST {AI_SERVICE_URL}/api/v1/ai/actions/execution-results
~~~

~~~json
{
  "requestId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2",
  "proposalId": "66dd9bdfa847ea856c7b41d2",
  "actionId": "source-zoom_meeting-66cc9bdfa847ea856c7b41d2-task-001",
  "status": "EXECUTED",
  "target": {
    "type": "TASK",
    "id": "66ee9bdfa847ea856c7b41d2"
  },
  "executedAt": "2026-09-10T10:30:00.000Z"
}
~~~

## 7. Acceptance checklist

AI Backend is ready when:

- [ ] analyze-source accepts inline context and returns raw requestId, source,
      actions, and required analysis.
- [ ] No proposal/task/meeting/approval callback is made to Main Backend.
- [ ] Only CREATE_TASK and SCHEDULE_MEETING actions are emitted.
- [ ] Stable actionId and proposedByAgent.id, name, and type are returned.
- [ ] Missing scheduling data creates clarification questions.
- [ ] ai/actions/refine is implemented and preserves action identity/type.
- [ ] Multiple actions from one transcript are tested.
- [ ] A complete task, clarification meeting, and approved provider meeting pass E2E.
