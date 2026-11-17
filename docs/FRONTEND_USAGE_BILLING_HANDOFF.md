# Frontend Usage Billing Handoff

## Purpose

These organization-scoped APIs expose measured PAYG/overage usage, Stripe
reconciliation state, and completed-period invoice generation. Currency is
USD. Frontend must never calculate or submit prices, allowances, or charges.

All routes require the normal bearer token. Write operations require an
organization `OWNER` or `ADMIN`.

## 1. Preview current usage billing

```http
GET /api/v1/billing/usage
Authorization: Bearer <access-token>
```

Historical preview:

```http
GET /api/v1/billing/usage?periodStart=2026-10-01T00:00:00.000Z&periodEnd=2026-11-01T00:00:00.000Z
```

This endpoint is read-only. It returns measured provider usage and the latest
saved reconciliation. Use it for the billing screen and polling after a write.

Important fields:

- `measuredUsage`: raw normalized usage totals by provider and metric;
- `metrics[].includedQuantity`: usage covered by the subscription/add-ons;
- `metrics[].billableQuantity`: measured overage;
- `metrics[].amountUsd`: customer usage charge;
- `metrics[].billedAmountUsd`: amount already converted into Stripe invoice
  items;
- `metrics[].status`: `NOT_REQUIRED`, `PENDING`, `BILLED`, or `FAILED`;
- `metrics[].availability`: Recall remains `UNAVAILABLE` until authoritative
  duration telemetry is recorded;
- `totals.measuredCostUsd`: provider cost telemetry, not the customer charge;
- `totals.customerUsageChargeUsd`: authoritative customer usage charge.

## 2. Reconcile measured usage

```http
POST /api/v1/billing/usage/reconcile
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

For a historical period:

```json
{
  "periodStart": "2026-10-01T00:00:00.000Z",
  "periodEnd": "2026-11-01T00:00:00.000Z"
}
```

The backend reads measured data and the subscription snapshot, then creates
only the missing Stripe invoice-item delta. The operation is idempotent;
retries do not duplicate charges. Frontend must not retry a `4xx`. Network and
`5xx` failures can be retried with the same request.

Twilio call overage continues to use its existing per-call idempotent billing
pipeline and is summarized here without creating a second charge.

## 3. Generate a completed-period invoice

```http
POST /api/v1/billing/usage/invoice
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "periodStart": "2026-10-01T00:00:00.000Z",
  "periodEnd": "2026-11-01T00:00:00.000Z"
}
```

Rules:

- the period must have ended;
- the organization must have a Stripe customer and subscription;
- reconciliation runs before invoice creation;
- no charge is created when the period has no billable measured usage;
- repeated requests are idempotent;
- the returned invoice may initially be `draft` or `open` while Stripe
  finalizes and attempts payment.

Display `hostedInvoiceUrl` when present. Do not treat the immediate response as
paid. Poll the usage summary/invoice history; Stripe webhooks update the final
`BILLED` or `FAILED` state.

## Existing usage endpoint

```http
GET /api/v1/usage
```

Keep using this endpoint for live allowance progress bars. Use
`/api/v1/billing/usage` for money and reconciliation state.

## Status UI

- `NOT_REQUIRED`: no overage charge;
- `PENDING`: Stripe item/invoice exists but payment is not confirmed;
- `BILLED`: Stripe confirmed invoice payment;
- `FAILED`: show retry/support action; do not display as paid.

Never show missing Recall duration as zero usage. Render the supplied
`availability` and `reason` instead.
