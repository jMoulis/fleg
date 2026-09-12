# START HERE — Coding Agent

## Current continuation — 2026-09-12

### Latest operation: dedicated Preview MongoDB configuration

PR #41 is merged (`acef6e8`). The manager authorized isolating Preview after
finding that it shared Production MongoDB variables. Atlas user `fleg_preview`
now has only `readWrite` on `fleg_preview_app` / `fleg_preview_auth`, scoped to
`Cluster0`. Real synthetic read/write/cleanup passed; both production database
reads were explicitly denied. Vercel has dedicated sensitive Preview URI/database
variables and Better Auth secret; legacy Mongo user/password entries are now
Production-only. Production values, local env and Blob flags were not changed.
Read the [deployment record](../docs/19_VERCEL_DEPLOYMENT.md#isolation-mongodb-preview--état-vérifié-le-2026-09-12).
Still pending: Preview auth origin, synthetic app seed/indexes, redeployment and
application acceptance. Old deployments retain their former credentials; their
retirement and coordinated rotation of the exposed historical Mongo password
are not done. No shared-credential Production change is authorized implicitly.
Separate Mongo databases mean local/Preview Blob quota counters are not globally
atomic despite sharing Blob dev. Keep the remote upload gate and charged
tombstones; coordinate the cumulative test budget before deployed acceptance.

### Latest override: usable development PDF uploads

The manager explicitly authorized debugging/uploads and real tests on Blob dev.
PR #41 now also adds a connected **Documents** page and owner-triggered verified
linking. Local `.env.local` enables `BLOB_DEV_UPLOADS_ENABLED=true` plus intent
reservations, namespace `local-development`, 100 MiB / 20-object ceilings.
Production is still rejected; no production variables or resources were changed.
The v2 `x-content-type` live probe passed all 14 checks, including a 25 MiB PDF;
the `Content-Type` control stored `image/png` and failed its negative check.
Both probes were cleaned. A separate real browser test on local disposable
MongoDB uploaded one 329-byte synthetic PDF to dev, recovered after an interrupted
verification and reload, linked once, downloaded identical SHA-256 bytes, then
removed the source (download becomes 404). Read the updated contract for evidence
and cleanup status. No user PDF, Atlas, production or OpenAI was used.
The following paragraphs retain the preceding lots' history, not the current
dev gate. Further per-run approval is not needed for bounded, in-scope dev tests.
Do not infer production rollout, a monthly budget, release of charged tombstones,
an offline photo queue, migration or AI extraction. TECH-04 and PILOT-01 stay open.

### Previously delivered lots and their historical gates

The original vertical slice, V1/V2/V3 and post-V3 UX sequence are delivered.
`PILOT-01` remains open for real operational evidence. `HARD-STORAGE-01` was
merged and deployed via PR #29; preserve its isolated E2E runner and retention
rules when continuing another branch.
`TECH-01` is merged/deployed via PR #28; `TECH-02` is merged via PR #30.
`TECH-03` opt-in draft synchronization is merged via PR #31; see
`35_TECH_03_INVENTORY_SYNCHRONIZATION.md`. Physical-device cold-room acceptance
requires its device/scenario evidence before claiming offline rollout readiness.
The manager reported testing the unified journey and explicitly requested the
return to the PR #26 roadmap on 2026-09-12. Do not infer an exhaustive device
matrix from that report. A synchronized draft is not a validated stock observation.

`UX-STOCK-01` is merged via PR #32. It harmonizes the offline stock interface
without changing the separate connected/offline workflows or sync protocol.
See `36_UX_STOCK_OFFLINE_WORKFLOW.md`; device acceptance still remains open.

The manager then confirmed the product correction: one business count regardless
of connectivity. `UX-STOCK-02` and its framing are merged via PR #34/#33;
the manager reports having tested it. Device/browser and detailed outcomes have
been requested, not invented. No new inventory UX redesign is requested.
`37_UNIFIED_MORNING_INVENTORY.md` records the contract, tests and recovery rules.
The authorized Stocks entry now leads to the single static editor, with integrated
preparation/consent, review, explicit online commitment and immutable correction.
Legacy drafts are upgraded in place, never purged; the former connected editor
is removed. Preserve local schema v3 and durable uncertain commit/correction intents.
**Next implementation: `TECH-04`**, following the original PR #26 order.
Read `38_TECH_04_PRIVATE_OBJECT_STORAGE.md` before implementation. It records
the existing BSON boundary, proposed limits, authorization/lifecycle tests and
the infrastructure record. After explicit approval, two private Paris Blob stores
are configured: `fleg-blob-dev` for Development/Preview and `fleg-blob-prod` for
Production. The former `fleg-blob` remains intact and disconnected. Local Blob
variables now point only to development; do not print or commit their tokens.
After PR #35, TECH-04 lot 1 implements strict upload-intent metadata, atomic
quotas, shared photo admission locks and a private/hybrid reader with pinned
`@vercel/blob` 2.8.0. It is disabled by default (`BLOB_INTENTS_ENABLED=false`).
PR #36 is merged. Lot 2 is split into reviewable sub-lots: 2a now implements
the server transport adapter, bounded persisted authorization attempts, signed
callback recording and cancellation. **Transport and callbacks remain release-locked**,
even with BLOB_INTENTS_ENABLED=true; no application route can issue an upload.
Only hermetic tests inject an enabled transport. Legacy BSON CRUD still works.
PR #37 and #38 are merged. **Lot 2b is implemented, still gated**: bounded object reads,
real PDFium WASM validation in a worker (60 pages, 10s, 256 MiB linear memory),
live-author reauthorization and transactional linking, private document APIs,
source removal and one-item scoped maintenance with recoverable leases.
See the lot 2b operational runbook in the contract. Maintenance remains usable
when new reservations are disabled, provided its private config is valid.
Only never-authorized reservations release quotas; issued objects stay charged
even after observed absence. The Blob photo UI/queue is still lot 3.
SDK 2.8.0 presigned `put` also permits multipart; expiry does not prove absence
of an in-flight upload. Do not release charged tombstones or remove the gate
without provider lifetime/cleanup evidence and authorized non-production acceptance.
Explicit callback-origin/public-key configuration and usage budgets also remain
activation gates. Local photo queue and migration follow, neither is delivered.
The isolated `npm run verify:storage` operator probe is merged via PR #39:
dry-run by default, pinned to the dev store,
synthetic fixtures only, explicit execution/store confirmation, durable local
manifest and exact-path cleanup. Read its runbook in the TECH-04 contract.
The manager explicitly authorized the bounded dev recipe on 2026-09-12.
Run `ad4be0a6-20c6-467a-91cb-53732b9d34d4` stopped at `mime_refused`: HTTP 200
instead of refusal, after issuing a scoped PNG authorization. Only 68 payload
bytes / 11 reserved operations were used; cleanup observed all three exact paths
absent. No PDF or subsequent security check ran. The local manifest is retained.
Read the live evidence section in the contract: the probe uses `Content-Type`,
whereas SDK 2.8.0 maps stored MIME to `x-content-type`. Effective stored MIME
was not captured before cleanup, so do not claim a proven provider vulnerability
or silently turn the failed check into a pass. Next: clarify/test the wire-level
MIME contract and record effective metadata before an explicitly framed rerun.
Do not reset this run, reuse its budget as if unused, or bypass its replay guard.
PR #39 and #40 are merged (`73045ff`). Branch
`codex/tech-04-mime-probe-evidence` prepares the v2 probe: one explicit
`--mime-header=content-type|x-content-type` variant (default preserves the first
recipe), HTTP response MIME and bounded private metadata observation before
cleanup. Six extra GETs make 27 nominal operations; limits remain 3 paths /
30 MiB sent / 100 operations. Real SDK wire tests are network-blocked, not
provider enforcement proof. Legacy v1 manifests stay cleanup-only, unchanged
in version/history and without counter reset. No second live run is performed
or authorized by this preparation; obtain a newly framed explicit approval
before execution. Read the v2 section in the contract before continuing.
It does not validate deployed callbacks, the Vercel PDF worker or photo UI.
`PILOT-01` remains open independently.

Read the current state in `implementation/10_BACKLOG.md`, then the relevant
`31_OFFLINE_AND_DOCUMENT_FOUNDATION.md` or `32_OPERATIONAL_COACH_ROADMAP.md`.
`V4-01` keeps its existing `30_WEEKLY_COMMERCIAL_BRIEF_IMPORT.md` contract.
Except for the delivered boundaries documented above, these remain planned
scopes, not available document/coach capabilities. Preserve the pilot,
source-data and authorization gates.

## Original bootstrap order

For a fresh rebuild, build only the P0 vertical slice first. Do not start Space Planner, TG or AI before `E2E-01` passes.

Read in this order:

1. `/AGENTS.md`
2. `/implementation/00_IMPLEMENTATION_BLUEPRINT.md`
3. `/implementation/02_AUTHORIZATION_AND_CONTEXT.md`
4. `/implementation/07_VERTICAL_SLICE_MVP.md`
5. `/implementation/10_BACKLOG.md`
6. relevant `/docs/*` file for the ticket
7. Figma UX reference linked in `/implementation/06_UI_IMPLEMENTATION_CONTRACT.md`

The first implementation ticket is `FND-01`. The first architectural gate is `AUTH-03`. The first business-value gate is `E2E-01`.
