# API execution contract

Every store endpoint follows:

`session -> org membership -> store permission -> Zod input -> service -> scoped repository -> response`

## MVP endpoints
```text
GET  /api/stores
GET  /api/stores/:storeId/dashboard?period=YYYY-MM
GET  /api/stores/:storeId/products/metrics?period=YYYY-MM
GET  /api/stores/:storeId/products/:productId?period=YYYY-MM
POST /api/stores/:storeId/imports/preview
POST /api/stores/:storeId/imports/:importId/commit
GET  /api/stores/:storeId/imports/:importId
GET  /api/stores/:storeId/recommendations?period=YYYY-MM
POST /api/stores/:storeId/recommendations/:id/decision
```

## Later endpoints
```text
GET/POST  /api/stores/:storeId/layout/versions
POST      /api/stores/:storeId/layout/optimize
GET/POST  /api/stores/:storeId/commercial-events
GET/POST  /api/stores/:storeId/markdown
GET/PATCH /api/stores/:storeId/space-policies
GET/POST  /api/stores/:storeId/allocations
GET/POST  /api/stores/:storeId/attachments
GET        /api/stores/:storeId/attachments/:attachmentId/content
DELETE     /api/stores/:storeId/attachments/:attachmentId
POST      /api/stores/:storeId/ai/chat
GET       /api/network/dashboard
POST      /api/network/ai/chat
```

## Error envelope
```ts
{
  code: string;
  message: string;
  fieldErrors?: Record<string,string[]>;
  requestId: string;
}
```

## V3-01 granular endpoints

```text
POST /api/stores/:storeId/imports/daily/preview
POST /api/stores/:storeId/imports/daily/:importId/commit
GET  /api/stores/:storeId/sales/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&productId=...
GET  /api/stores/:storeId/sales/weekly?from=YYYY-MM-DD&to=YYYY-MM-DD&productId=...
GET  /api/stores/:storeId/sales/reconciliation?period=YYYY-MM&productId=...
```

Daily preview/commit use `imports.create` and `imports.commit`. Granular reads
use `analytics.read`. Organization and store scope come only from the server
context. Read ranges default to 28 days ending on the latest authorized daily
observation and reject explicit windows longer than 366 days. See
`implementation/12_GRANULAR_DATA_FOUNDATION.md`.

## Idempotency
Import commit is idempotent by `(storeId, source fingerprint, period)`. State-changing API routes that can be retried should accept an idempotency key where useful.
