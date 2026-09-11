# START HERE — Coding Agent

## Current continuation — 2026-09-11

The original vertical slice, V1/V2/V3 and post-V3 UX sequence are delivered.
`PILOT-01` remains open for real operational evidence. `HARD-STORAGE-01` was
merged and deployed via PR #29; preserve its isolated E2E runner and retention
rules when continuing another branch.
`TECH-01` is merged/deployed via PR #28; `TECH-02` is merged via PR #30.
`TECH-03` implements opt-in draft synchronization for review; see
`35_TECH_03_INVENTORY_SYNCHRONIZATION.md`. Physical-device cold-room acceptance
remains open. Close that gate before claiming offline rollout readiness or
advancing TECH-04. A synchronized draft is not a server-validated stock observation.

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
