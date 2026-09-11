# TECH-01 — prepared, read-only offline workspace

Implementation: 2026-09-11. This is not offline stock entry: TECH-02 owns durable
edits and TECH-03 owns replay, conflict resolution and cold-room acceptance.

## Delivered boundary

- Installable manifest with `/offline` as its start URL; icon assets and French
  installation instructions. The inventory page links to preparation for its date.
- A public, static Next.js shell, with a client-only field workspace. It contains
  no server-rendered identity or business data. Other application screens remain
  Server Components and require a connection.
- Explicit download of the complete active catalogue (up to the configured
  budget), profiles, selected count lines and last observed stock references.
  Products not visited previously remain searchable. Lists show at most 25 cards.
- One disposable reference per browser profile, identified by user, hashed login
  session id, organization, store and business date. Preparing another scope
  explicitly replaces it; opening an unprepared scope never falls back to another.
- Revision, preparation time, expiry, count version and observation time remain
  visible. Nothing is committed to MongoDB or consumed by the order engine.

## APIs and completeness

`GET /api/stores/:storeId/offline?businessDate=YYYY-MM-DD` requires
`inventory.read` through `requireStoreContext`. The service repeats the session
identity check and scopes each repository query. A sentinel (`budget + 1`)
rejects oversized catalogues, rather than silently inheriting the normal product
selector's 1,000-item cap. A data revision change during preparation rejects it.

`GET /api/stores/:storeId/offline/access` reauthorizes the exact store and returns
only the scoped identity with a hash of the login session id, never a session token.
Both routes retain `Cache-Control: no-store`. Zod verifies the version, complete
product count, uniqueness, line references and lease at server and local boundaries.

## Local storage and security

Serwist 9.5.12 precaches an explicit `/offline` shell, icons and build-generated
static JS/CSS/assets. There is no runtime default-cache strategy, authenticated
HTML cache, RSC cache, auth cache, API response cache or cross-origin cache.
The worker verifies all precached entries before accepting a preparation; missing
assets cannot masquerade as readiness. The shell can be opened offline without a
prepared reference but shows only instructions, never business data.

Dexie 4.4.6 manages IndexedDB `fleg-offline-reference-v1`, schema 1. `copies`
contains only `current`; `meta` holds a session epoch. Replacement is atomic. A
logout/login increments the epoch and clears the reference before authentication;
an old in-flight request cannot recreate it. Open tabs observe invalidation.
When connected, session/permission mismatch clears the copy before showing it.
Network failure is distinct from an explicit access denial: a valid local lease
can be used when Wi-Fi reports connected but requests cannot reach the server.

Default server configuration (see `.env.example`):

- `OFFLINE_MAX_AGE_HOURS=12`, permitted range 1–24; session expiry may shorten it.
- `OFFLINE_RETENTION_HOURS=24`, permitted range 1–48 and not below maximum age.
- `OFFLINE_MAX_PRODUCTS=2000`, permitted range 1–2,000.

Expired copies cannot be consulted. Purge is lazy on the next local access, and
also checked while the field screen is open. A closed browser cannot guarantee
background deletion at an exact time. Device clocks before the preparation time
fail closed; restore automatic device date/time and prepare again.

Quota estimation reserves twice the serialized payload size for local replacement.
IndexedDB failures block readiness; denied persistence shows a warning and an
actionable installation/recheck procedure. Browser eviction, manual deletion and
device loss are not backups. Only protected, trusted devices should prepare data.
Remote revocation is not immediately observable by an already disconnected device.

## Updates, development and rollback

- Production builds use the existing webpack scripts. Serwist's webpack integration
  is disabled in development; `npm run dev` does not promise offline preparation.
  `npm run build:turbopack` is not an offline release/acceptance path.
- The worker never uses automatic skip-waiting, reload-on-online or navigation
  prefetch caching. A waiting update is announced; finish connected work and close
  all application tabs/windows to activate it. There is no forced reload button.
- Hashed assets and shell revision update together. Old caches are cleaned only
  when the new worker activates. Unrecognized local schemas fail closed and offer
  explicit discard/reprepare; no schema downgrade is guessed. No draft migration
  exists because this ticket stores no editable work.
- TECH-02/03 must keep drafts/outbox separate from this disposable reference and
  revisit update/session behavior before any pending edits can exist locally.
- Browserslist is narrowly overridden to 4.28.8 for `@serwist/next`, whose pinned
  4.28.6 triggers two high-severity advisories. The installed tree audits clean.
  Reassess/remove this override after an upstream corrected release.

No MongoDB schema/index migration, business coefficient, paid service or cloud
resource change is required. Vercel Blob and vector search remain later tickets.

## Acceptance evidence and device matrix

Revalidated on 2026-09-11 after integrating master and storage fix PR #29:
`npm run check` passed (81 files, 298 tests; 2 real-Mongo tests run separately).
The real-Mongo storage suite passed all 3 tests, including its pure evidence test.
The production webpack build passed; the full E2E run passed 48 scenarios,
including all 16 TECH-01 mobile/desktop scenarios, with 4 live-OpenAI tests
intentionally skipped. `npm audit --omit=dev` reports zero vulnerabilities.
These are local results for the integrated branch, not a claim that its new
GitHub CI run or a physical-device pilot has already completed.

The isolated E2E runner from PR #29 is preserved, including the `build:e2e`
webpack/Serwist contract and refusal of Atlas connections. Local validation used
a fresh native MongoDB 6.0.1 replica set because Docker was unavailable; GitHub
CI uses MongoDB 8.0. Temporary application/auth and storage-test databases were
removed after the run. No production data or existing backup was touched.

Automated production-build recipe: `npm run test:e2e -- e2e/offline-workspace.spec.ts`.
The two Chromium projects cover 390px touch/mobile emulation and 1440px desktop.
They exercise complete/unprepared catalogues, unvisited pages, reload/tab closure,
real browser shutdown and restart with the same disk profile, expiry, partial
downloads, denied storage, capacity exhaustion, missing shell cache, account/store
isolation and a waiting worker update without forced reload. Store API checks use
the authorized demo environment; catalogue coverage uses sanitized 52-item fixtures.
Screenshots of the real demo preparation after offline restart are test artifacts.

Physical Android Chrome, iPhone/iPad Safari (browser and installed), actual store
tablet model/OS/browser and storage-eviction behavior are **not yet field-validated**.
Chromium viewport emulation and a persistent profile are not a claim of installed
iOS/Android acceptance. Record device, OS, browser version, browser/installed mode,
preparation time, offline reopen outcome, persistence warning and expiry for each
device during the technical pilot. Prepare again inside the installed app because
its storage can differ from the browser tab. Do not count stock offline yet.

Next implementation: TECH-02. Full cold-room workflow acceptance stays with TECH-03;
commercial usefulness and real-data calibration stay with PILOT-01.
