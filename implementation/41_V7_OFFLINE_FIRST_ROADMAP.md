# V7 — unified offline-first application

## Decision — 2026-09-14

The manager requests a **deferred V7 refactoring epic using Serwist** to move
beyond isolated offline workflows toward one coherent offline-first application.
This is roadmap authorization only: **the current offline extension freeze stays
in force**. Do not implement this epic, expand caches, change synchronization or
remove existing safeguards as part of current document/coach work.

`V7` is a future horizon, not a delivery date or a definition of a missing V6.
It does not replace TECH-05/06, reorder V4/V5 or close PILOT-01. Start only after
explicit reprioritization informed by field feedback and a reviewed architecture.

## V7-01 — Serwist offline-first refactoring

**Priority:** P3 / deferred. **Prerequisites:** inventory of delivered TECH-01/03
behavior, PILOT-01 feedback, target-device testing and explicit product approval.

**Outcome:** the manager uses the same navigation, screens and operational
workflow with or without a network connection. Prepared data remains usable;
eligible edits are durably saved locally and synchronized without losing work.
Avoid a separate documentation-heavy offline workspace or requiring the manager
to understand storage and synchronization internals.

### 1. Define the supported offline contract

- Inventory every screen/action as locally readable, locally editable and queued,
  or necessarily online; define preparation, freshness and missing-data states.
- Prioritize measured field needs: catalog/search, stock, operational drafts,
  prepared plans and previously generated evidence. Confirm each write workflow
  separately; this list is not permission to change approval rules.
- Keep first login, access to an unprepared store, new remote AI generation,
  external API refresh and server-side document processing explicitly online.
  Cached AI results are dated evidence, not new analyses. No implicit local model,
  background execution guarantee or supplier-order submission is included.

### 2. Review architecture before migrating

- Retain Next.js unless an approved architecture decision demonstrates a need
  to change it. Evaluate the installed Next/Serwist versions at implementation
  time; SSR does not become offline-capable just by adding a service worker.
- Use Serwist for the service-worker/app-shell strategy, and the existing
  IndexedDB/Dexie foundation for bounded domain data, drafts and a durable outbox.
  Define local/server repository contracts and versioned synchronization; avoid
  blanket caching of private SSR HTML, RSC responses or authenticated APIs.
- Define user/store isolation, local access duration, shared-device locking and
  logout behavior. Disclose that remote revocation cannot be learned while
  disconnected. Reauthorize every synchronization on the server; a cached scope
  never grants server access. Preserve recoverable pending work without exposing
  it to a different user.
- Keep the server authoritative for committed facts and approvals. Specify
  idempotency, optimistic concurrency, explicit conflicts and auditable mutations.
  No silent last-write-wins for business data or automatic approval of AI drafts.

### 3. Migrate incrementally with one UX

- Deliver small module-level lots, beginning with prepared reads, then eligible
  writes. Reuse domain calculations and authorization boundaries.
- Show compact saved/pending/conflict/stale states close to the relevant action;
  preparation and reconnect must not create duplicate workflows or duplicate data.
- Bound device storage, retention and preparation scope. Define quota failures,
  failed transactions and eviction recovery. Never present an unsaved edit as safe.
- Preserve existing stock drafts and queued photos through IndexedDB migrations,
  service-worker updates and rollback. Do not purge pending work to fix upgrades.

### 4. Acceptance and progressive rollout

- Maintain a module/action acceptance matrix, including explicit online-only
  exceptions; do not advertise universal offline support before it is proven.
- Test cold launch in airplane mode, navigation, large-catalog search, prepared
  reads and edits, interrupted requests, duplicate retries and reconnect recovery.
- Test process termination, schema/service-worker upgrades, quota/eviction cases,
  stale data, concurrent edits, expired sessions, revoked access after reconnect,
  user/store switching and shared devices. Include store-isolation regressions.
- Verify on the actual phones/tablets and supported browsers, not just mocked
  network tests. Record data-loss/duplication checks and time to finish field tasks.
- Roll out per module behind a reversible control. Rollback must preserve queued
  work and provide a recovery path. Compare effort and error rates with the
  current flow before expanding coverage.

## Not part of the current sequence

No package change, new cache, production flag, data migration or UI change is
authorized by this document. Preserve the current freeze and continue the
document-processing and coaching roadmap independently of V7.
