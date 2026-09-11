# TECH-03 — reliable inventory draft synchronization

Implemented after merged TECH-02 PR #30, on 2026-09-11. Review, deployment and
physical-device acceptance remain gates; this is not commercial PILOT-01 evidence.
No Blob, vector search, AI call, new paid service or supplier integration is added.

## Delivered boundary

The `/offline` editor offers explicit opt-in per draft. Existing TECH-02 drafts
remain local until **Activer la synchronisation de ce brouillon** is selected.
After that, foreground reopening, focus and reconnect resume pending work. A
manual retry is available. No promise of background execution while the app is
closed is made, and `navigator.onLine` is not authority or proof of connectivity.

The display separates local save, pending/syncing, server acknowledgement,
failure, locked access and conflict. Even a synchronized count is a **draft**.
Only the existing connected, permissioned, revision-checked commitment creates
stock snapshots and changes the store data revision. Orders still require their
own explicit approval and are never transmitted to the supplier.

## Local durability and upgrade

IndexedDB database version 3 adds a `sync` table beside `copies`, `meta`, `drafts`
and `operations`. The table key is user/organization/store/business date. Enabling
sync changes the draft record to schema version 2, preserving its UUID, raw
values and view. TECH-02 readers reject that version instead of editing/deleting
work being uploaded. Local-only version 1 drafts remain readable by this release.
Never delete site storage to fix a worker/upgrade problem. On rollback, close old
tabs and restore a compatible version before resuming; preserve all local tables.

An IndexedDB transaction freezes one operation UUID, exact payload, base server
count/revision and source edit IDs before any network call. Subsequent edits may
coalesce in `operations`, but never change the in-flight payload. An ACK deletes
only the matching edit IDs; edits made during the request remain queued. Filter
changes are never transmitted. Partial numeric draft lines can sync; unfinished
raw strings stay local and are reported as needing correction/confirmation.

Web Locks serialize foreground runners across tabs of the same origin and scope.
Unsupported browsers retain local edits and report that synchronization is
unavailable. Do not advertise them as supported offline-sync devices. Transport
constants live in `syncTransportPolicy`: 1.5 s settling, 5 s foreground checking,
15 s request timeout, exponential retry from 2 s to 60 s, maximum 5 automatic
attempts. Attempts/backoff persist across reopening. Manual retry resets the
counter. Local persistence itself remains immediate, not debounced.

## Server protocol and authorization

`POST /api/stores/:storeId/offline/sync` requires Better Auth and `inventory.write`.
The current session binding header must match the server session, and the body
owner must match its authorized user/organization/store. The client also checks
access before POST; the server repeats authorization independently. Session
binding is not part of the immutable body so the same owner can reauthenticate
and resend the same operation with a fresh authorized binding.

The body is limited to 1 MiB and 2,000 unique, Zod-validated product lines. All
products must still be active in the authorized store. The frozen timezone must
match the store's timezone (`Europe/Paris` default). A future device observation
is rejected; null/unknown stock never becomes zero. The business date is fixed.

The server transaction reads the latest count and compares its ID/revision to
the frozen base. It patches only changed product lines; it never replaces the
count with a stale catalogue-wide snapshot. Count mutation, compact command
receipt and audit append are atomic. The new `inventorySyncCommands` collection
uses the implicit unique `_id`: SHA-256 of authorized organization/store/user and
operation UUID. The command stores the parsed payload hash and ACK, not a full
count. Exact repetition returns the original ACK even after later revisions;
same UUID with different content is rejected. No additional index migration or
environment variable is required.

Audit action `inventory.count.offline_synchronized` records changed lines once,
actor, operation/draft IDs, hash and revisions. No store data revision increment,
snapshot or order generation happens during synchronization. Receipts are durable
and have no TTL: deleting them would remove the lost-response replay guarantee.
Storage grows with accepted change batches, not connection retries or full
catalogue copies per keystroke. Track bytes/day/store before generalization.

## Recovery, conflicts and observations

Timeout/5xx outcomes retain the exact operation because the server may have
applied it. Uncertain operations cannot be discarded. Authorization failures lock
transport; sign-out clears only the disposable reference. Reauthenticate as the
same owner, prepare the same store/date, then retry. Other accounts cannot read
or replay that queue. A prepared offline lease still cannot learn a remote
revocation immediately; expiry bounds offline access and never silently purges
unsynchronized drafts. Browser eviction/device loss remains a risk.

A scoped HTTP 409 returns the latest server count and stops writes. The manager
chooses local or server values for **each pending article**, paginated by 10.
Quantities are never added or silently overwritten. Resolution checks the local
generation/revision, rebases and uses a new operation; server CAS checks again
at upload. If the server count is committed, create an explicit correction in
connected Stocks and refresh the conflict before resolving it. A validated 400
can be explicitly retired with **Réviser l’envoi refusé** while keeping its edits;
unknown outcomes cannot. Server-selected values are references, not a new local
observation; recount to confirm before editing their quantities.

`inventoryCount.lines.observedAt` is additive/optional for existing records. An
offline observation retains its original timestamp through later upload and
commitment; received/updated/committed timestamps remain distinct. Connected
saves ignore supplied observation timestamps, preserve unchanged lines and stamp
changed counts on the server. Existing committed values reused in a correction
retain their observation time. Legacy lines without it use commitment time as
before. Existing unchanged-snapshot versioning is preserved.

## Verification and release gates

Automated coverage includes: 500-product local catalogue, raw partial input,
immutable retry after IndexedDB reopen, edit during request, ACK scope/revision,
ACK quota rollback, bounded retry, tab locking, owner reauthentication, explicit
conflict choices, refusal recovery, API authorization and validation boundaries.
Real MongoDB tests cover concurrent duplicate/revision races, one compact receipt
and audit, store/user isolation, audit failure rollback, commitment timestamps,
explicit correction and timezone/future-clock refusal. The CI runs those tests
against its disposable MongoDB 8 replica set.

Production-build Playwright uses the real October 2025 Mercalys fixture (303
products in the standalone run; additional products from other full-suite cases),
on mobile 390 and desktop 1440. It exercises an actual
Chromium process restart, offline edits, a successful write with lost response,
exact replay, unchanged stock facts, and two independent device contexts with
conflicting values. All tests use disposable local MongoDB; Atlas and live AI
remain excluded. Browser screenshots are reviewed for clipping and action access.

Final verification on 2026-09-11:

- `STORAGE_TEST_MONGODB_URI=<disposable-local-uri> npm run check`: lint,
  TypeScript, unused-code audit and **334/334 tests**, 86 files, no skips.
  This includes 7 sync and 2 existing real-storage cases normally skipped without
  a local MongoDB URI; no Atlas data is used.
- Full isolated production-build E2E: **64 passed, 4 live-AI cases skipped**.
  The final recipe also opens the connected Stocks UI and explicitly commits
  the synchronized count, verifying quantities and original observation time.
- Mobile/desktop screenshots inspected; long sync action labels wrap on mobile.
  No physical-device acceptance or commercial pilot result is claimed.
- Local MongoDB version 6.0.1; CI retains its MongoDB 8 replica set. Temporary
  test databases are deleted by their owning runners. No environment change,
  historical migration, Atlas cleanup or new dependency is required.

Run `npm run check`, the two `STORAGE_TEST_MONGODB_URI` persistence suites and
the full isolated E2E runner before merge. This release record does **not** close
TECH-03: run the French [offline field checklist](../docs/user/08_PILOT_BETA_CHECKLIST.md#recette-hors-connexion-tech-03)
on actual iOS/Android/tablet targets before rollout. Record app/build, OS/browser,
installation mode, timings, quantities, failures and recovery. PILOT-01 still
requires real sales/stock outcomes; synthetic recovery tests do not validate it.

References checked: installed Next.js route/client guides,
[Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()),
[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API),
[MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/fundamentals/transactions/).
The original Figma link remained inaccessible; the existing offline/inventory UI
was used as the visual reference.
