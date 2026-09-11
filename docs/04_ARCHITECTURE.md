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

## Planned offline and document extension

As of 2026-09-11 the following is a backlog decision, not deployed behavior.
See [the technical contract](../implementation/31_OFFLINE_AND_DOCUMENT_FOUNDATION.md).

- `TECH-01..03`: a prepared PWA shell and scoped IndexedDB drafts with durable
  operation replay, explicit conflicts and online server commitment. Browser
  permission/cache state never replaces Better Auth or store authorization.
- `TECH-04`: private object storage for files; MongoDB keeps metadata, scope and
  lifecycle. Existing BSON photo storage is supported during transition.
- `TECH-05`: persistent, bounded extraction jobs with retries and cancellation.
- `V4-01` then `TECH-06`: reviewed commercial fields followed by scoped vector
  retrieval with page citations. Financial and ordering calculations continue
  to use validated structured facts and deterministic domain services.

Evaluate Serwist, Dexie, private Vercel Blob, durable workflows and Atlas Vector
Search against the installed framework, target devices, cluster and budget at
implementation time. Do not blanket-cache existing authenticated API responses.

## Observability
Structured logs with requestId, organizationId, storeId, userId when appropriate. Track import duration, recommendation compute duration, AI tool latency/cost.
