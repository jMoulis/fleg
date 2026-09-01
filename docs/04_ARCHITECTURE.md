# 04 — Technical architecture

## Modules
```text
app/
  (auth)/
  (app)/
    [organizationSlug]/
      network/
      stores/[storeId]/
  api/
server/
  auth/
  db/
  repositories/
  services/
  analytics/
  forecasting/
  recommendations/
  space/
  imports/
  ai/
domain/
  schemas/
  types/
```

## Request path
`Better Auth session -> organization membership -> store authorization -> service -> scoped repository -> MongoDB`

## Database
Prefer separate logical DBs on same Atlas cluster:
- `fl_cockpit_auth`
- `fl_cockpit_app`

## Repository rule
No unscoped `findAll()` for business facts.
```ts
salesRepository.findByPeriod({ storeId, periodKey });
analyticsRepository.compareStores({ organizationId, storeIds: authorizedStoreIds, periodKey });
```

## Caching
Cache derived analytics by `(storeId, periodKey, dataRevision, settingsRevision)`. Invalidate on import commit, markdown change, settings/layout change.

## Background work
MVP imports can be synchronous if small. Define job abstraction so large imports/recomputation can later move to a queue.

## Observability
Structured logs with requestId, organizationId, storeId, userId when appropriate. Track import duration, recommendation compute duration, AI tool latency/cost.
