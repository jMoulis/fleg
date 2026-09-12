# START HERE — Coding Agent

## Current continuation — 2026-09-12

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
even with BLOB_INTENTS_ENABLED=true; no real token or object has been issued.
Only hermetic tests inject an enabled transport. Legacy BSON CRUD still works.
Continue with **lot 2b**, not TECH-05: actual byte/PDF verification, current-author
reauthorization before linking, source consultation and durable cleanup/trigger.
SDK 2.8.0 presigned `put` also permits multipart; expiry does not prove absence
of an in-flight upload. Do not release charged tombstones or remove the gate
without provider lifetime/cleanup evidence and authorized non-production acceptance.
Explicit callback-origin/public-key configuration and usage budgets also remain
activation gates. Local photo queue and migration follow, neither is delivered.
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
