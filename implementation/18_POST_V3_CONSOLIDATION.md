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

### 4. PILOT-01 — instrumented single-store pilot

Status: waiting for restored Mercalys access.

Resume when daily exports are available. Backfill historical daily data where
possible, configure the active `3400` and `3402` assortment, then measure the
real morning workflow before changing the order model. The pilot must establish
a baseline for markdown/waste, freshness or availability proxy, task duration,
forecast confidence, draft availability and override frequency.

## Exit condition

The bridge to V4 is complete only when:

- the repository cleanup is merged with no regression;
- the user guide matches the production interface;
- the inventory workflow remains usable with hundreds of product records;
- the pilot has enough observed data to identify real friction and evaluate the
  ordering assumptions;
- the next roadmap is chosen from evidence rather than feature availability.
