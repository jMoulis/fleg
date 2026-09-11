# Post-V3 consolidation sequence

## Decision

Real Mercalys data is temporarily unavailable. The application must not invent
pilot evidence or start V4 calibration without it. The interim sequence focuses
on reversible consolidation and user readiness.

## Ordered work

### 1. HARD-02 — dead-code audit and repository hygiene

Deliver as a behavior-preserving pull request:

1. remove the two currently confirmed unused repository constructor fields;
2. enable TypeScript unused-local and unused-parameter checks;
3. add a Next.js-aware audit for unused files, exports and dependencies;
4. review every reported candidate before deletion and document retained
   framework entry points or intentional public contracts;
5. run the full quality, build and browser acceptance gates.

This ticket must not redesign domain boundaries, rename APIs or change business
calculations under the label of cleanup.

### 2. DOC-01 — documentation hub and French user guide

Keep the existing technical history, then add a clear audience entry point:

- `docs/README.md` — documentation portal;
- `docs/user/00_START_HERE.md` — roles, access and first navigation;
- `docs/user/01_IMPORTS_AND_DATA_QUALITY.md`;
- `docs/user/02_MORNING_STOCK_AND_ORDER.md`;
- `docs/user/03_PRODUCTS_FORECASTS_AND_RECOMMENDATIONS.md`;
- `docs/user/04_SPACE_TG_MARKDOWN_AND_EXPERIMENTS.md`;
- `docs/user/05_DECISIONS_AND_COPILOT.md`;
- `docs/user/06_ADMINISTRATION.md`;
- `docs/user/07_GLOSSARY_AND_TROUBLESHOOTING.md`.

The first version is text-first. Representative screenshots follow after pilot
data exists, so the guide does not encode misleading empty or synthetic states.

### 3. UX-LIST-01 — scalable morning inventory workflow

Before the pilot, remove the already observed usability barrier caused by
rendering the complete product reference and every input at once. Keep the
V3-02 contracts unchanged while splitting inventory into reserve, shelf, review
and configuration views, bounding visible product cards and keeping draft
actions reachable. The implementation contract is
`implementation/21_INVENTORY_LIST_UX.md`.

### 4. UX-LIST-02 — scalable product matrix

Bound the next already observed high-cardinality view before the pilot. Apply
the existing product search, filters and sort before URL-backed pages of 25,
while preserving the separate mobile-card and desktop-table representations.
The implementation contract is
`implementation/22_PRODUCT_MATRIX_LIST_UX.md`.

### 5. UX-LIST-03 — scalable order review

Focus the morning decision on calculated lines, with explicit access to
unavailable evidence, search, status/family filters and bounded pages. Preserve
all overrides across navigation and keep manager approval reachable. The
implementation contract is `implementation/23_ORDER_LIST_UX.md`.

### 6. UX-LIST-04 — searchable allocation product selectors

Replace the two full-catalog selectboxes on Espace → Allocations with searchable
lists of at most 10 products per page. The shelf picker exposes only compatible,
not-yet-allocated products and adds directly from the result row. The
implementation contract is `implementation/24_ALLOCATION_PRODUCT_PICKER_UX.md`.

### 7. UX-LIST-05 — scalable markdown capture and history

Replace the full-catalog markdown selectbox with a searchable picker of at most
10 candidates, then filter and paginate the loaded fact history by 25. Preserve
the existing observed-fact, audit and store-isolation contracts. The
implementation contract is `implementation/25_MARKDOWN_LIST_UX.md`.

### 8. UX-LIST-06 — scalable TG product selection and cancelled history

Use the shared searchable product picker for TG composition and paginate the
collapsed cancelled-event history by 25. Keep the active weekly calendar intact
because it is already bounded by week, authorized endcaps and overlap rules.
The implementation contract is `implementation/26_TG_LIST_UX.md`.

### 9. UX-LIST-07 — scalable experiment selectors and history

Search and bound the tested-product and linked-operation selectors in the
experiment wizard, then search and paginate each lifecycle category by 25.
Keep the complete experiment workflow and evidence model unchanged. The
implementation contract is `implementation/27_EXPERIMENT_LIST_UX.md`.

### 10. UX-LIST-08 — scalable context selection and evidence histories

Replace the complete promotion-product checklist with direct additions from
searchable pages of 10, then paginate promotion and weather evidence separately
by 25. Preserve the V3-05 observed-fact and missing-context model. The
implementation contract is `implementation/28_CONTEXT_LIST_UX.md`.

### 11. UX-LIST-09 — searchable photo target selection

Use the shared bounded option picker for photo targets so historical TG
operations and layout fixtures remain searchable without being rendered all at
once. Keep PREV3-04 storage, authorization and retention unchanged. The
implementation contract is `implementation/29_ATTACHMENT_TARGET_PICKER_UX.md`.

### 12. PILOT-01 — instrumented single-store pilot

Status: waiting for restored Mercalys access.

Resume when daily exports are available. Backfill historical daily data where
possible, configure the active `3400` and `3402` assortment, then measure the
real morning workflow before changing the order model. The pilot must establish
a baseline for markdown/waste, freshness or availability proxy, task duration,
forecast confidence, draft availability and override frequency.

### Additional field requirement — 2026-09-11

The manager reports unreliable connectivity in the store/cold room. The planned
`TECH-01..03` sequence in
[31 — Offline and document foundation](./31_OFFLINE_AND_DOCUMENT_FOUNDATION.md)
addresses this before claiming offline readiness. It can be tested with
sanitized data while Mercalys is unavailable. Connected pilot observations can
resume independently; record their application version and network conditions.
Document storage and AI features do not block the start of those observations.

## Exit condition

The bridge to V4 is complete only when:

- the repository cleanup is merged with no regression;
- the user guide matches the production interface;
- the inventory workflow remains usable with hundreds of product records;
- the product matrix remains navigable with hundreds of filtered products;
- order review remains actionable with hundreds of calculated and unavailable
  lines;
- context capture remains usable with hundreds of product records and
  accumulated observations;
- allocation and product-constraint selection remains usable with hundreds of
  catalog products;
- markdown capture and history remain usable as products and observed facts
  accumulate;
- TG product composition and cancelled history remain bounded as the catalog
  and event history grow;
- photo targets remain searchable as TG and fixture histories grow;
- the pilot has enough observed data to identify real friction and evaluate the
  ordering assumptions;
- any claimed offline workflow has passed `TECH-03` on the actual field devices;
- the next roadmap is chosen from evidence rather than feature availability.
