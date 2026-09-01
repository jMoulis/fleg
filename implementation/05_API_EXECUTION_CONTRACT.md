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

## Idempotency
Import commit is idempotent by `(storeId, source fingerprint, period)`. State-changing API routes that can be retried should accept an idempotency key where useful.
