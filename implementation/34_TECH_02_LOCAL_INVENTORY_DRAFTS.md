# TECH-02 — persistent local inventory drafts

Implemented on 2026-09-11; follows merged TECH-01 #28 and storage fix #29.
This is a local-only implementation, not stock synchronization or server commitment.
No local value is consumed by the order engine. No new paid service or MongoDB
collection/index is introduced; the isolated E2E runner is unchanged.

## Delivered boundary

The prepared `/offline` workspace offers an explicit local count for users with
`inventory.write`. The connected `/inventory` workflow is unchanged. All API
reads retain server store authorization and `no-store`. Preparation and access
responses include a server-derived write capability; legacy copies default to
read-only and must be prepared again. This capability is only an offline UI
lease, never authority for a future server mutation.

Drafts are keyed by user, organization, store and business date. They retain a
local UUID, optional draft server count id/base revision, data revision, schema
version, original catalogue labels and per-line raw values. A refresh cannot
replace the draft, even when the reference catalogue or packaging has changed.
The manager can explicitly adjust packaging within that draft.

Each edit starts persistence immediately; no debounce or unload-only saving.
The draft and its pending operation are saved in one IndexedDB transaction.
Only the transaction acknowledgement produces the saved status. A failed write
preserves the visible unsaved input and offers retry or an explicitly confirmed
reload of the stored version. Navigation/reprepare is guarded during pending or
failed writes. Renewing an expired catalogue remains possible to unlock retry;
it never replaces the draft or its unsaved buffer. Focus/network checks keep the
editor mounted while locking its UI; manual network retry does not reload the page.

Raw text preserves unfinished numbers (`1,`, `-`), blank and explicit zero.
Domain validation and totals reuse the existing inventory rules outside React.
Piece quantities remain integers; negative totals are flagged, not clamped.
Search, family, completion filter, reserve/shelf step and page are persisted.
Lists stay bounded to 25 rows with a reachable save-status/action footer.

## Time and scope

`stores.timeZone` is optional, IANA-validated on read, with an explicit
`Europe/Paris` default for the existing French stores. No store data is migrated.
Preparation freezes this timezone into the draft; new markets must configure
the store timezone before use. Business date remains the selected date. The UI
warns when the current store-local day differs, rather than silently redating it.
`observedAt` records the last count-input edit, independently of `updatedAt` and
operation `savedAt`; configuring family/packaging alone is not a new observation.
Imported reference values keep a null local observation timestamp. A backward
clock relative to preparation or the last write is rejected; future upload time
must remain distinct in TECH-03.

The session epoch and current prepared lease are checked in the same database
transaction as each draft write. A sign-in/out invalidates only the disposable
catalogue. The draft remains stored but cannot be read through the application
without a fresh matching owner/store/date lease. Same-owner reauthentication can
recover it; another account sees neither its values nor its list of dates.
Known revocation locks access; offline devices remain bounded by the prepared
lease because they cannot learn a remote revocation immediately.

## Storage bounds, upgrade and rollback

IndexedDB `fleg-offline-reference-v1` upgrades from database version 1 to 2,
adding **separate** `drafts` and `operations` stores. `copies` and `meta` remain
disposable; their clearing never clears pending work. Record schemas are version 1.
Unknown formats fail closed, never trigger a guessed migration or data deletion.

The device budget is `OFFLINE_MAX_LOCAL_DRAFTS` (default 14, range 1–30), included
in preparation. At the limit, new creation fails without eviction. Expiration
locks draft access but never silently deletes unsynchronized work. Owners can
list dates for the prepared store and explicitly delete an exact draft with its
revision; its operations are removed atomically. No automatic history purge.

Only local-unsent operations exist here: one start operation and the latest edit
per product, each with its own UUID. Edits coalesce **before any transport exists**,
so typing cannot accumulate full-catalogue snapshots. At most 2,001 operations
per 2,000-product draft. TECH-03 must version/migrate this boundary and freeze any
in-flight operation before sending; never mutate a sent id/payload. UI-only filter
changes do not enter the business operation queue.

Close all app tabs after confirming local save to activate a waiting worker.
Do not clear site storage to fix a stale worker. Dexie 4 retries a lower native
database version against the existing database: an older TECH-01 client can still
read/clear its reference tables, but cannot display the new drafts. The upgrade
test verifies that a legacy reader's copy clearing preserves those drafts.
For rollback, preserve the database and restore a compatible draft reader to
resume work; never delete site storage. Unknown draft record versions fail closed
at the Zod boundary. Older tabs/workers may need to be closed during
upgrade. Neither the lease nor this storage layer is encryption or remote backup.
Only protected trusted devices are appropriate; eviction/device loss remains a risk.

## Verification and remaining gates

Unit and IndexedDB tests cover raw inputs, packaging freeze, timezone midnight,
owner/store/date scoping, reference refresh, CAS conflicts, atomic rollback on
quota failure, database reopen, locked recovery and bounded storage.
Browser tests cover raw-value/filter reload, zero, stale fetch racing with edits,
failed-write retry across focus, real Chromium process restart and reauthentication.
Production-build tests use isolated local MongoDB, not Atlas; live AI is disabled.

Validation on 2026-09-11:

- `npm run check`: lint, strict TypeScript, unused-code audit; 309 tests passed,
  2 MongoDB-only cases skipped in the default run.
- Dedicated `STORAGE_TEST_MONGODB_URI` run: 3/3 passed against an isolated local
  replica set, including the 2 cases skipped above.
- Full production-build E2E: 60 passed, 4 live-AI cases intentionally skipped.
  The new recipe imports the existing October 2025 Mercalys fixture through the
  real API, prepares the catalogue, counts offline, reloads, and verifies the
  server reference/data revision remain unchanged. It does not advance the
  default period used by existing allocation recipes.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities reported.
- Final TECH-02 browser rerun after the mobile filter adjustment: 12/12 passed.

Local tests used MongoDB 6.0.1 (native disposable replica set); CI still uses its
existing MongoDB 8 container. No Atlas test data was written. Mobile/desktop
screenshots were inspected; mobile filters scroll so they do not obscure the
counting fields, while the bottom action/save-status bar remains sticky.

Physical iOS/Android/tablet validation is still required. No claim of a completed
cold-room operational count or commercial PILOT-01 is made. TECH-03 owns transport,
server authorization/idempotency/revision conflicts and the full field recipe.

References checked: [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()),
[liveQuery](https://dexie.org/docs/liveQuery()) and installed Next.js client/route guides.
The original Figma link was unavailable; the existing inventory/offline UI is the
visual reference for this incremental change.
