# V7 — native mobile companion and connected Next.js desktop

## Decision — 2026-09-14

The manager requests evaluation of a **React Native / Expo mobile companion in
a monorepo**, retaining the current Next.js desktop application and backend.
This amendment supersedes the earlier Serwist-first refactoring target. It is
not an Expo Web migration or a replacement of the desktop UI.

If native mobile proves suitable for field work, the proposed target is to make
it responsible for supported offline workflows and progressively retire the web
PWA layer. This is roadmap authorization only: **the current offline extension
freeze stays in force**. Neither a native implementation nor removal of current
offline capabilities is authorized by this document.

`V7` is a future horizon, not a delivery date or a definition of a missing V6.
It does not replace TECH-05/06, reorder V4/V5 or close PILOT-01. Start only after
explicit reprioritization informed by field feedback and a reviewed architecture.

## V7-01 — evaluate native mobile and simplify the web application

**Priority:** P3 / deferred. **Prerequisites:** inventory of delivered TECH-01/03
behavior, PILOT-01 feedback, target-device testing and explicit product approval.

**Outcome:** keep Next.js for connected desktop analysis and administration;
provide a focused native field experience that works with prepared data when
disconnected. Eligible edits are durably saved and synchronized without loss.
Keep consistent business language across clients, not necessarily identical UI.
Moving offline to native relocates synchronization complexity; it does not
eliminate it, and introduces a second UI and mobile distribution to maintain.

### 1. Review feasibility and the supported offline contract

- Inventory every screen/action as locally readable, locally editable and queued,
  or necessarily online; define preparation, freshness and missing-data states.
- Confirm actual phones/tablets, supported operating systems, installation and
  distribution channels, release ownership and costs. Explicitly approve a
  connected-only web contract before retiring browser offline support; responsive
  connected web access can remain available on mobile.
- Prioritize measured field needs: catalog/search, stock, operational drafts,
  prepared plans and previously generated evidence. Confirm each write workflow
  separately; this list is not permission to change approval rules.
- Keep first login, access to an unprepared store, new remote AI generation,
  external API refresh and server-side document processing explicitly online.
  Cached AI results are dated evidence, not new analyses. No implicit local model,
  background execution guarantee or supplier-order submission is included.

### 2. Review a monorepo architecture before migrating

- Proposed boundaries, not a directory migration authorization:
  - `apps/web`: current Next.js App Router desktop UI and application APIs;
  - `apps/mobile`: React Native / Expo native UI and local persistence;
  - `packages/domain`: portable, pure business calculations;
  - `packages/contracts`: Zod schemas, DTOs and versioned sync contracts;
  - `packages/api-client`: typed transport with platform-specific auth adapters.
- Keep MongoDB access, Blob credentials, OpenAI credentials and PDF processing
  server-side. Mobile calls authorized APIs, never databases directly. Inventory
  API coverage before assuming current browser interactions are reusable.
- Keep Better Auth and domain store authorization. Evaluate its Expo integration;
  deliberately adapt session binding, origin and CSRF protections for native
  transport. Do not disable browser security checks globally to make mobile work.
- Share business logic and contracts where portable. DOM, shadcn/Base UI and CSS
  components are not directly native screens; do not promise universal UI reuse.
  Existing Next.js / Server Component rules remain applicable to web and server;
  any native-specific repository rules need an explicit architecture decision.
- Evaluate package workspaces first; a task runner such as Turborepo is optional.
  Do not change package manager or deployment topology without a reviewed need.
- Evaluate native SQLite for bounded reference data, drafts and a durable outbox.
  Serwist is not the native persistence layer. Specify local/server repository
  contracts; SQLite alone does not provide synchronization or conflict resolution.
- Define user/store isolation, local access duration, shared-device locking and
  logout behavior. Disclose that remote revocation cannot be learned while
  disconnected. Reauthorize every synchronization on the server; a cached scope
  never grants server access. Preserve recoverable pending work without exposing
  it to a different user.
- Keep the server authoritative for committed facts and approvals. Specify
  idempotency, optimistic concurrency, explicit conflicts and auditable mutations.
  No silent last-write-wins for business data or automatic approval of AI drafts.

### 3. Prove stock entry, then expand incrementally

- After explicit implementation approval, begin with a bounded stock prototype
  using isolated synthetic data: prepare catalog, count reserve and shelf stock,
  cold-start offline, save, reconnect and resolve conflicts. Compare task time
  and errors with the current app before approving a migration or more modules.
- Show compact saved/pending/conflict/stale states close to the relevant action;
  preparation and reconnect must not create duplicate workflows or duplicate data.
- Bound device storage, retention and preparation scope. Define quota failures,
  failed transactions and eviction recovery. Never present an unsaved edit as safe.
- Version APIs and local schemas for old installed mobile releases that continue
  running after backend deployments. Test upgrades and rollback compatibility.
- Browser IndexedDB and native storage are separate: no automatic transfer of
  existing drafts or queued photos. Define an authenticated recovery/sync path.

### 4. Acceptance and progressive rollout

- Maintain a module/action acceptance matrix, including explicit online-only
  exceptions; do not advertise universal offline support before it is proven.
- Test cold launch in airplane mode, navigation, large-catalog search, prepared
  reads and edits, interrupted requests, duplicate retries and reconnect recovery.
- Test process termination, app/local-schema upgrades, quota/eviction cases,
  stale data, concurrent edits, expired sessions, revoked access after reconnect,
  user/store switching and shared devices. Include store-isolation regressions.
- Verify native workflows on actual phones/tablets, not just mocked
  network tests. Record data-loss/duplication checks and time to finish field tasks.
- Keep connected desktop and cross-client regression tests, including concurrent
  updates from web and mobile. Native background sync is best effort, not a promise
  that a closed app will always synchronize; foreground recovery must work.
- Roll out per module behind a reversible control. Rollback must preserve queued
  work and provide a recovery path. Compare effort and error rates with the
  current flow before expanding coverage.

### 5. Retire the web PWA only after native acceptance

- Gate removal on accepted native field workflows, a usable distribution path
  and explicit agreement that web requires connectivity. Until then, keep the
  existing stock workflow functional; do not reopen its feature scope.
- Recover or synchronize pending browser stock drafts, operations and photos
  under the correct user/store before retiring their storage adapters. A server
  cannot prove every disconnected browser has an empty queue. Plan for old
  installations returning later; never blindly purge IndexedDB or local work.
- Transition existing Fleg service-worker registrations and owned caches with a
  tested retirement mechanism. Preserve a reachable worker/update and recovery
  path during transition; simply deleting `/sw.js` and `/offline` is insufficient.
  Do not clear unrelated origin storage or registrations.
- After those gates, remove the Serwist build wrapper/dependencies, service-worker
  registration, PWA manifest/install UI and obsolete offline pages. Remove Dexie
  and browser adapters only when no remaining workflow consumes them.
- Retain shared backend synchronization, idempotency, optimistic concurrency,
  tenant authorization and audit capabilities needed by native. They are domain
  safeguards, not disposable PWA code.
- Test old installed PWAs reopening, unsent drafts/photos, expired sessions,
  retirement upgrades and rollback. Replace obsolete web-only tests only after
  their intended coverage has moved or been explicitly retired.

## Technical references for the architecture review

Reviewed 2026-09-14; recheck supported versions at implementation time:

- [Expo monorepos](https://docs.expo.dev/guides/monorepos/): supported workspace
  approach, with additional tooling and dependency-management complexity.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/): persistent
  native local database candidate, not a synchronization engine.
- [Better Auth Expo integration](https://better-auth.com/docs/integrations/expo):
  native authentication integration to evaluate against current server policies.
- [Service worker unregistration](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/unregister):
  lifecycle reference for a separately tested web retirement strategy.

## Not part of the current sequence

No package change, new cache, production flag, data migration or UI change is
authorized by this document. Preserve the current freeze and continue the
document-processing and coaching roadmap independently of V7.
