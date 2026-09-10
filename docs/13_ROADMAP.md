# 13 — Roadmap

## V1 Foundation
Multi-store auth, imports, dashboards, matrix, forecast, ABC/XYZ proxy, recommendations.

## V2 Physical retail & experimentation
Layout editor, fixture/shelf capacity, allocations, TG planner, markdown, decision log, Tests & Experiments MVP with actual-vs-expected uplift evaluation.

## Pre-V3 completion gate

Completed on 2026-09-07. The remaining V1/V2 feedback loops were delivered as:

1. `PREV3-01` — authorized store targets and configurable business coefficients;
2. `PREV3-02` — realized recommendation outcomes and before/after Decision Log follow-up;
3. `PREV3-03` — must-stock, product-fixture suitability and markdown-aware allocation constraints;
4. `PREV3-04` — manual photo attachments for stores, layouts, fixtures and commercial events.

V1, V2 and the explicit completion gate are delivered. Authorized network
analytics and control-store/difference-in-differences evaluation are early V4
capabilities already delivered.

## V3 Granular operations

1. `V3-01` — daily sales ingestion and deterministic weekly views;
2. `V3-02` — stock snapshots and explicit availability evidence;
3. `V3-03` — true XYZ from complete granular demand windows;
4. `V3-04` — day-of-week forecasting;
5. `V3-05` — promotion and weather context features;
6. `V3-06` — evidence-backed order suggestions that remain drafts.

The additive data and delivery contract is documented in
`docs/22_GRANULAR_OPERATIONS_V3.md`.

## Post-V3 consolidation and pilot gate

Before extending the learning network, complete the bridge defined in
`implementation/18_POST_V3_CONSOLIDATION.md`:

1. `HARD-02` — behavior-preserving dead-code and repository-hygiene audit;
2. `DOC-01` — documentation hub and French user guide;
3. `UX-LIST-01` — reserve/shelf inventory workflow and bounded product lists;
4. `UX-LIST-02` — URL-paginated mobile and desktop product matrix;
5. `UX-LIST-03` — filtered, paginated order review with persistent approval;
6. `UX-LIST-04` — searchable, bounded product selection for constraints and
   shelf allocations;
7. `UX-LIST-05` — searchable product selection and filtered, paginated markdown
   history;
8. `PILOT-01` — instrumented single-store pilot, waiting for restored Mercalys
   access and real daily exports.

No unavailable operational observation may be replaced with synthetic pilot
evidence. V4 priorities are adjusted only from observed pilot friction and
outcomes.

## V4 Learning network
Calibrated location coefficients, comparable-store benchmarks, control-store/difference-in-differences experiment evaluation, experiment-derived location/family response learning, recommendation outcome learning.

## V5 Advanced
Computer vision from fixture photos, constrained optimizer, supplier/order integrations, anomaly detection.

Do not start V5 before data quality and decision outcome tracking are reliable.
