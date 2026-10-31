# ROI Dashboard API Guide

## Purpose

The ROI Dashboard keeps three different concepts separate:

- measured automation activity from executed Main Backend records;
- estimated time and labor-cost savings calculated from organization settings;
- CRM revenue/pipeline data, which is never added to money saved and has no AI
  attribution.

All routes require an authenticated organization `OWNER` or `ADMIN`.

## Get the dashboard

```http
GET /api/v1/roi-dashboard?range=30_DAYS
Authorization: Bearer <access-token>
```

Supported ranges are `7_DAYS`, `30_DAYS`, and `90_DAYS`. The default is
`30_DAYS`. Date
boundaries use the organization's timezone.

The response contains:

- `cards`: measured task/meeting counts and estimated hours/money saved;
- `projection`: the next 30 days using the trailing 30-day daily average;
- `savingsTrend`: daily measured counts and estimated savings;
- `growthOverview`: daily task and meeting counts;
- `tasksByAgent`: measured AI-created task distribution;
- `timeSavedByCategory`: task, meeting, CRM, email, and follow-up rows;
- `savingsBreakdown`: estimated savings totals;
- `crmRevenue`: separate CRM pipeline totals grouped by currency.

`tasksAutomated` and `meetingsAutoScheduled` are measured and return
`isEstimated: false`. Savings return `isEstimated: true` because they use the
configured minutes per action and blended hourly labor cost.

Follow-up activity currently returns:

```json
{
  "key": "FOLLOW_UP",
  "availability": "UNAVAILABLE",
  "count": null,
  "reason": "FOLLOW_UP_ACTIVITY_NOT_MODELLED"
}
```

The frontend must not render an unavailable value as zero.

## Get effective savings settings

```http
GET /api/v1/roi-dashboard/settings
Authorization: Bearer <access-token>
```

When the organization has no override, safe platform defaults are returned:

```json
{
  "methodologyVersion": "1.0",
  "taskCreationMinutes": 15,
  "meetingSchedulingMinutes": 20,
  "crmUpdateMinutes": 5,
  "emailDraftMinutes": 10,
  "hourlyLaborCost": 25,
  "currency": "USD",
  "source": "PLATFORM_DEFAULT",
  "isEstimated": true
}
```

The currency uses the organization's default currency. `USD` is only the
fallback when that value is invalid or missing.

## Update organization savings settings

```http
PATCH /api/v1/roi-dashboard/settings
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "taskCreationMinutes": 18,
  "meetingSchedulingMinutes": 25,
  "crmUpdateMinutes": 7,
  "emailDraftMinutes": 12,
  "hourlyLaborCost": 30,
  "currency": "USD"
}
```

Every field is optional, but at least one is required. Partial updates retain
all current effective values. Changes are organization-scoped and audited.

## Download the PDF report

```http
GET /api/v1/roi-dashboard/report?range=30_DAYS
Authorization: Bearer <access-token>
Accept: application/pdf
```

The response is an on-demand PDF attachment. It is generated from the same
snapshot as the dashboard and includes the methodology and estimated-data
notice. The frontend should download the response as a blob; it should not try
to parse the response as JSON.

## Measurement sources

- Tasks automated: executed `CREATE_TASK` AI action proposals.
- Meetings auto-scheduled: executed `SCHEDULE_MEETING` AI action proposals.
- CRM updates: executed `UPDATE_CRM_RECORD` AI action proposals.
- Email drafts: email draft records linked to an AI response.
- CRM revenue/pipeline: locally synchronized normalized CRM deals.

Only executed action proposals affect automation savings. Pending, rejected,
failed, or clarification-stage proposals do not count.

## Frontend rules

1. Display an `Estimated` label wherever `isEstimated` is true.
2. Use `availability`; never turn `UNAVAILABLE` into zero.
3. Display CRM pipeline separately from money saved.
4. Do not sum different CRM currencies.
5. If `comparison.changePercent` is `null`, show `New` or an equivalent label
   instead of an infinite percentage.
6. Use the server-provided date keys and organization timezone for chart
   labels.
