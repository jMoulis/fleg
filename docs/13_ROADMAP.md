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
8. `UX-LIST-06` — searchable TG product composition and paginated cancelled
   operations;
9. `UX-LIST-07` — searchable, bounded experiment inputs and paginated lifecycle
   histories;
10. `UX-LIST-08` — searchable promotion composition and paginated contextual
    evidence histories;
11. `UX-LIST-09` — searchable, bounded photo targets for TG operations and
    layout fixtures;
12. `PILOT-01` — instrumented single-store pilot, waiting for restored Mercalys
   access and real daily exports.

No unavailable operational observation may be replaced with synthetic pilot
evidence. V4 priorities are adjusted from documented pilot findings. The manager
has additionally reported unreliable in-store connectivity, including the cold
room; this operational constraint justifies the technical sequence below before
commercial calibration. Connected pilot work can resume as soon as real exports
are available, independently of document/AI delivery.

## Technical field and document foundation — planned 2026-09-11

1. `TECH-01` — installable PWA, prepared catalog and offline field entry point.
2. `TECH-02` — durable local inventory drafts, restored after app closure.
3. `TECH-03` — idempotent synchronization, conflict resolution and real-device
   cold-room acceptance. This gates the offline pilot claim, not the start of
   connected commercial observations.
4. `TECH-04` — private Blob files, recoverable uploads and legacy-photo transition.
5. `TECH-05` — durable document-processing jobs with retries and bounded cost.
6. `TECH-06` — scoped, cited document retrieval, after `V4-01` extraction.

The next implementation ticket is `TECH-01` after the planning PR is merged.
No PWA, Blob service or vector index is activated by this documentation. See
[the technical contract](../implementation/31_OFFLINE_AND_DOCUMENT_FOUNDATION.md).

## V4 Operational coaching and learning — planned

Preserve `V4-01` and the original learning-network direction. The new tickets
extend existing stock, ordering, context, space and experiment engines:

1. `V4-01` — reviewed weekly commercial brief PDF/image import; requires
   `TECH-05`, the pilot findings and a representative original PDF.
2. `V4-02` — automatic and qualitative context journal.
3. `V4-03` — local product/theme hypotheses and anonymous demand signals, with
   optional suitable aggregate territorial context and no customer profiling.
4. `V4-04` — objective-led briefing and a small, scored action shortlist.
5. `V4-05` — AI-assisted test design with granular evaluation and human conclusions.
6. `V4-06` — contextual coaching of the already delivered `V3-06` order drafts.
7. `V4-07` — constrained TG, island and allocation proposals.
8. `V4-08` — empirical context effects, reusable experiment results and explicit
   promotion of calibrated coefficients after shadow evaluation.

The first useful outcome is less time spent reaching a supported decision.
Freshness, waste and availability remain guardrails when optimizing revenue or
margin. Penetration needs aggregate transaction data that current product sales
alone do not supply. Recommendations, experiments and notifications share a
bounded manager workload.

Detailed dependencies and acceptance are in
[the coach roadmap](../implementation/32_OPERATIONAL_COACH_ROADMAP.md),
[the original brief contract](../implementation/30_WEEKLY_COMMERCIAL_BRIEF_IMPORT.md)
and [the backlog](../implementation/10_BACKLOG.md). Pilot findings may change the
suggested order; suitable data and controls remain additional calibration gates.

## V5 Multimodal coach — deferred

1. `V5-01` — sourced international professional/research knowledge with explicit
   applicability and local test follow-up.
2. `V5-02` — photo-assisted presentation observations confirmed by the manager.
3. `V5-03` — visual merchandising proposals and bounded, evidence-based simulation.
4. `V5-04` — actionable anomaly follow-up within the same attention budget.

Do not start V5 before data quality and decision outcome tracking are reliable.
The historical supplier-integration idea is deferred outside this sequence:
FLEG does not place actual supplier orders. Generated visuals do not constitute
observed execution, food-safety checks or verified stock quantities.
