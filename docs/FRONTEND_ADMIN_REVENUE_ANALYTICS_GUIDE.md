# Platform Admin Revenue & Analytics Frontend Guide

## Access and shared range

Every route requires a Platform Admin bearer token. Analytics use USD and the
same half-open reporting range:

```text
[from, to)
```

Example query:

```text
from=2026-11-01T00:00:00.000Z
to=2026-12-01T00:00:00.000Z
timezone=Asia/Dhaka
```

Do not replace `UNAVAILABLE` with `0`. Render unavailable and partial states
from the API, and disclose values where `isEstimated` is `true`.

## Dashboard APIs

### Methodology

```http
GET /api/v1/platform/revenue-analytics/methodology
```

Use this as the UI explanation/source contract. It is not dashboard data.

### Churn and retention tab

```http
GET /api/v1/platform/revenue-analytics/retention?from=<iso>&to=<iso>&timezone=<iana>
```

UI mapping:

- `summary`: churn, NRR, and realized LTV cards
- `trend`: monthly churn and NRR charts
- `lifetimeValueByPlan`: plan LTV cards/table
- `cohorts`: retention matrix
- `coverage`: source-completeness disclosure

### Unit economics tab

```http
GET /api/v1/platform/revenue-analytics/unit-economics?from=<iso>&to=<iso>&timezone=<iana>
```

UI mapping:

- `summary`: gross margin, cost per AI task, cost per organization, CAC,
  LTV/CAC, and payback cards
- `providerCosts`: AI, Twilio, and Recall costs
- `acquisitionCosts`: sales/marketing costs and channel breakdown
- `trend`: revenue, provider cost, and margin charts
- `coverage`: provider telemetry completeness

### Export PDF

```http
GET /api/v1/platform/revenue-analytics/report?from=<iso>&to=<iso>&timezone=<iana>
Accept: application/pdf
```

The response is a PDF attachment, not JSON. Download it as a blob and prefer
the filename supplied by `Content-Disposition`. The report combines the same
retention and unit-economics data used by the dashboard; it does not recalculate
or mutate subscription data.

Browser example:

```ts
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${accessToken}` },
});

if (!response.ok) throw new Error('Report download failed');

const blob = await response.blob();
const objectUrl = URL.createObjectURL(blob);
const anchor = document.createElement('a');
anchor.href = objectUrl;
anchor.download =
  filenameFromContentDisposition(response.headers) ??
  'noltra-revenue-analytics.pdf';
anchor.click();
URL.revokeObjectURL(objectUrl);
```

## Acquisition-cost management

```http
POST   /api/v1/platform/revenue-analytics/acquisition-costs
GET    /api/v1/platform/revenue-analytics/acquisition-costs
GET    /api/v1/platform/revenue-analytics/acquisition-costs/{id}
PATCH  /api/v1/platform/revenue-analytics/acquisition-costs/{id}
DELETE /api/v1/platform/revenue-analytics/acquisition-costs/{id}
POST   /api/v1/platform/revenue-analytics/acquisition-costs/import
```

Create/update payload fields:

```json
{
  "period": "2026-11",
  "channel": "PAID_SEARCH",
  "salesCostUsd": 1200,
  "marketingCostUsd": 2500,
  "notes": "November acquisition spend"
}
```

Valid channel values:

```text
PAID_SEARCH
ORGANIC_SEARCH
PAID_SOCIAL
ORGANIC_SOCIAL
EMAIL
OUTBOUND
PARTNER
REFERRAL
EVENT
OTHER
```

CSV import uses `multipart/form-data` with one `file` field. Required headers:

```csv
period,channel,sales_cost_usd,marketing_cost_usd,notes
2026-11,PAID_SEARCH,1200,2500,November acquisition spend
```

The file is validated completely before any write. Import is idempotent by
`period + channel`, supports up to 500 rows and 2 MB, and returns created,
updated, and unchanged counts.

## UI loading and error behavior

- Fetch retention and unit economics in parallel for the two tabs.
- Refetch unit economics after a successful acquisition-cost mutation/import.
- Keep the last successful chart visible during background refresh.
- Treat `401` as session expiration and `403` as non-Platform-Admin access.
- Show validation messages from `400` responses; never silently coerce values.
- Report download should use a separate loading state from dashboard queries.
