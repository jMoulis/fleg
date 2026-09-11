# V4/V5 — Operational F&L coach

## Decision and status

Framed on 2026-09-11. This document records the product discussion as planned
tickets; it does not declare those features delivered. `V4-01` keeps its existing
identifier and [commercial-brief contract](./30_WEEKLY_COMMERCIAL_BRIEF_IMPORT.md).
The [technical foundation](./31_OFFLINE_AND_DOCUMENT_FOUNDATION.md) comes first
for the reported cold-room connectivity problem.

The manager's time, freshness, waste, availability, revenue and gross margin
are the outcomes. ABC/XYZ and model details remain available as evidence while
the default interface answers what to do next and why. FLEG prepares decisions;
the manager implements them on the floor and places actual orders in the usual
external tool.

## Existing foundations to extend

- `V3-02` and `UX-LIST-01`: manual reserve/shelf counts, variable pack sizes and
  article units; the first offline delivery extends these workflows.
- `V3-04` and `V3-06`: weekday forecasts and deterministic, auditable order
  suggestions already exist. `V4-06` improves their contextual evidence and UX.
- `V3-05`: manual promotion/weather observations already exist. `V4-02` adds
  automatic preparation and qualitative context without replacing history.
- `SPC-03`, `TG-01`, `PREV3-03`: layouts, TGs, allocations and constraints exist.
- `EXP-*`, `DEC-01`, `PREV3-02`, `AI-01..03`, `NET-01`: experiment lifecycle,
  versioned analysis, human conclusions, decisions, AI drafts and authorized
  comparison exist. Daily experiment evaluation and calibrated causal estimates
  still require explicit extension and evidence.

## Delivery gates and sequence

- Planning, technical recovery tests and sanitized document fixtures can
  advance before restored Mercalys access. They cannot validate commercial
  effectiveness or close `PILOT-01`.
- V4 implementation priorities are reviewed against a documented `PILOT-01`
  outcome, including an inconclusive result or corrective actions. A negative
  pilot is useful evidence, not permission to ignore broken stock assumptions.
- `V4-01` additionally requires a representative original PDF. `TECH-04/05`
  supply storage and processing; `TECH-06` follows confirmed source extraction.
- Suggested V4 delivery: `V4-01`, `TECH-06`, `V4-02`, `V4-03`, `V4-04`, `V4-05`,
  `V4-06`, `V4-07`, `V4-08`. Independent context work may proceed when its own
  gates are met; document any pilot-driven change in order and its reason.
- `V4-04` must remain useful with missing optional local/context sources.
  `V4-06/07` may propose an experiment with uncalibrated context, but cannot
  apply learned numerical adjustments before the `V4-08` promotion gate.
- V5 follows reliable data/outcome tracking, the relevant V4 gates and an
  explicit delivery decision. Future suppliers/API order execution is outside
  this roadmap, consistent with the manager's stated use of the app.

## Shared acceptance contract

Every feature requires bounded types/Zod boundaries, server-authorized store
access, appropriate calculation/isolation tests, responsive accessible states,
audit for mutations and updated French help on delivery. New providers and
models are evaluated and configured at implementation time, not assumed enabled.

Recommendations distinguish observed facts, central claims, forecasts,
calculations and hypotheses. Preserve inputs, dates, data/settings revisions,
model/prompt versions, limitations and the manager's decision. An opportunity
score, evidence-quality grade and calibrated statistical uncertainty are
different quantities; never fabricate a numeric confidence or an expected gain.

The initial proposed display budget is three recommendations and one active
test by default, configurable and pilot-adjustable with an explicit rationale.
This is a workload limit, not a business coefficient. The user can inspect more
evidence on demand; generating more candidates must not create more alerts.

Penetration means the proportion of eligible store transactions containing
F&L, with a documented denominator and matching time window. Current sales
totals alone cannot supply it: show unavailable until a suitable aggregate
transaction source exists. Likewise, do not invent basket affinities, labor
costs, freshness or lost sales from unavailable observations.

## V4-01 — weekly commercial brief

**Priority:** P1. **Depends on:** `PILOT-01`, `TECH-05` and a representative PDF.
Use the existing detailed contract. It ends with reviewed source evidence and
explicit draft handoffs, not local adoption or supplier ordering.

## V4-02 — automatic and qualitative context journal

**Priority:** P1. **Depends on:** `PILOT-01`, `V3-05`, `TECH-03`, `TECH-05`.
**Value:** capture useful context with minimal morning typing.

Acceptance:

- Prefill location/date-scoped weather forecasts, observed weather and school/
  public-holiday calendars through selected provider adapters. Regional alerts
  and local event feeds follow only where an appropriate source exists.
- Capture manual supplier quality, strike, works, delivery or local demand
  notes as qualitative evidence with observation time, author and provenance.
  Support bounded offline notes using the existing local/sync foundation.
- Keep forecast issuance/valid time, observations, corrections and retrieval
  time distinct; provider updates are versioned and never rewrite prior facts.
- A regional alert or public event is context, not proof that this store was
  affected. No note means unknown, not absence of an event.
- Deduplicate automatic entries, expose missing/outdated sources and ask the
  manager only for useful exceptions. Context collection does not apply an
  unexplained sales multiplier.
- Test provider failure, timezone/date boundaries, duplicate imports, offline
  replay and no cross-store exposure; measure time spent maintaining the journal.

## V4-03 — local assortment opportunities

**Priority:** P2. **Depends on:** `PILOT-01`, `V4-02`.
**Value:** propose a limited assortment test before sales history can prove
demand for a product that the store does not yet offer.

Acceptance:

- Record a manager hypothesis about products, recipes or commercial themes,
  aggregate anonymous requests and public events with source/date/uncertainty.
  A manager can initiate a theme without a demographic dataset or prior sales.
- Optionally add documented public, genuinely anonymous aggregate catchment
  indicators when availability, geographic fit, freshness and lawful reuse have
  been checked. Neighborhood residents are not assumed to be actual customers.
- Never collect or infer individual ethnicity/religion from names, photographs,
  language, loyalty records, baskets or personal addresses. Do not construct
  customer ethnic segments or use geographic proxies to reconstruct them.
- Renaming a sensitive inference as an opportunity or deleting its raw inputs
  is not anonymization. Evaluate the actual processing before activating any
  proposed demographic source; otherwise use product-level hypotheses alone.
- Distinguish a culinary theme such as a Mediterranean TG from an assertion
  about customer identity. Offer it to all shoppers and test modest initial
  volumes, waste, margin, demand and substitution.
- Preserve hypothesis provenance and update conclusions from observed results,
  never convert an initial intuition into proven demand automatically.

## V4-04 — objective-led morning briefing and prioritization

**Priority:** P1. **Depends on:** `PILOT-01`, `AI-03`, `REC-01`, `TECH-03`.
**Value:** reduce time to a useful decision while keeping analytical detail
available on demand.

Acceptance:

- Let the manager choose a primary objective: freshness/waste, availability,
  margin, revenue or a named product/family. Preserve trade-offs and guardrails.
- Rank eligible candidates deterministically using explicit, bounded,
  versioned components for measurable value, evidence, risk and field effort.
  The LLM explains and drafts wording; it cannot invent scoring inputs.
- Present the bounded shortlist with action, reason, evidence, uncertainty,
  effort and measurable effect where available. A justified no-action result
  is valid. Deduplicate and suppress deferred/rejected repetitions.
- Provide a distinct, bounded exploration option for an unproven product/theme;
  lack of evidence must be visible rather than converted into a financial gain.
- Keep network scope explicit and recommendations readable from cached evidence
  offline. New AI generation waits for a connection; approval uses live rights.
- Evaluate decision time, usefulness and workload against the pilot baseline;
  numeric consistency, unavailable penetration and sparse evidence are test cases.

## V4-05 — guided experiments and granular evaluation

**Priority:** P1. **Depends on:** `V4-04`, `V3-01`, `EXP-05`.
**Value:** turn one chosen opportunity into a manageable, informative field test.

Acceptance:

- Draft a hypothesis, products/fixture, actual intervention, owner, period,
  primary metric, guardrails, baseline/control and stop criteria before start.
  Reuse the existing lifecycle, permissions and manager conclusion.
- Add explicit daily/weekly baseline and evaluation support for short TG tests.
  Existing complete-month analysis must not claim to evaluate seven-day sales.
  Freeze source granularity; never combine monthly and daily totals twice.
- Check coverage, stockouts, concurrent promotions and overlapping interventions.
  Keep actual implantation/compliance separate from the suggested treatment.
- Enforce the configured workload budget; avoid launching overlapping tests
  that prevent interpretation. Human adoption and execution remain separate.
- Analyze revenue, margin, observed waste and available substitution indicators
  reproducibly. Missing controls/costs/denominators yield explicit limitations.
- Preserve winners, failures, neutral and inconclusive results in structured,
  versioned memory. Completion does not fine-tune the LLM or change coefficients.
- Evals cover missing days, failed implantation, confounding and a complete
  draft-to-human-conclusion path; elapsed test time cannot force a conclusion.

## V4-06 — contextual coaching of existing order suggestions

**Priority:** P1. **Depends on:** `V4-01`, `V4-02`, `V4-04`, `V3-06`, `TECH-03`.
**Value:** explain and review the existing deterministic draft more quickly.

Acceptance:

- Reuse `V3-06`; preserve reserve plus shelf stock, per-count pack/unit, the
  09:30 local deadline, Friday Saturday/Sunday coverage and Saturday-to-Monday
  ordering. Surface the current-day arrival assumption from the pilot.
- Use only synchronized, committed stock for authoritative calculation. A
  cached or changed draft displays its age/revision and requires refresh before
  online approval; no hidden reinterpretation of arrival or on-order quantities.
- Link approved commercial plans and contextual evidence to review priorities.
  Claims about weather/promotional demand remain hypotheses until validated
  coefficients from `V4-08` exist; LLM text cannot alter numeric order lines.
- Separate net demand from pack-rounding surplus and freshness/waste exposure.
  An optional local what-if calculation must be labelled provisional and use
  the same versioned deterministic formulas.
- Keep justified overrides and human approval auditable. Measure review time,
  useful overrides, availability and observed waste; never send an actual order.

## V4-07 — constrained TG, island and allocation proposals

**Priority:** P1. **Depends on:** `V4-01`, `V4-04`, `V4-05`, `PREV3-03`.
**Value:** prepare a small number of actionable commercial layouts.

Acceptance:

- Combine confirmed brief candidates, seasonality, available sales/stock and
  optional local hypotheses with the exact authorized layout version.
- Keep fixture geometry, island faces/modules, locked placements, must-stock,
  suitability and capacity as deterministic hard constraints. The AI cannot
  invent a fixture dimension or override a locked location.
- Produce a bounded comparison of executable drafts, with themed products,
  allocation, field tasks, rationale, risk and an optional linked experiment.
- Respect source date semantics and local adoption; a central TG recommendation
  is not already an active promotion. Stale layout or evidence blocks publishing.
- Use existing TG/allocation workflows for explicit publication. Measure setup
  effort and observed outcomes; no guaranteed uplift or automatic geometry change.

## V4-08 — empirical context effects and reusable learning

**Priority:** P2. **Depends on:** `V4-02`, `V4-05`, `EXP-06`, `PREV3-02`.
**Additional gate:** enough suitable observations/concluded experiments for
the chosen method; no fixed sample size is treated as universal proof.

Acceptance:

- Estimate contextual associations and, where assumptions support it, effects
  of heat, holidays, disruptions or interventions by product/family/store.
  Deterministic computation alone does not establish causality.
- Predefine outcomes, windows, covariates and eligible controls; inspect
  seasonality, price/promo changes, stockouts, pre-trends and confounding. Clearly
  distinguish correlation, quasi-experimental estimate and unresolved effect.
- Backtest without future-data leakage, retain uncertainty and account for
  multiple comparisons/selection bias. Do not learn only from successful tests.
- Keep a versioned registry of conclusions and proposed coefficients with their
  source experiments, population/time applicability and exact access scope.
- Run proposed coefficients in shadow mode, evaluate against a baseline and
  require an explicit audited promotion/rollback decision before consumption by
  forecasts, ordering or allocation. No silent retraining or automatic rollout.
- Reauthorize each contributing store for network results and historical
  explanations. Similar-store matching is evidence-based and never an ethnic
  customer profile; single-store usage remains supported.

## V5-01 — sourced primeur and merchandising knowledge

**Priority:** P2. **Depends on:** `TECH-06`, `V4-05`.
**Additional gate:** reliable pilot data/outcome tracking and a reviewed corpus.

Acceptance: curate permitted international professional and primary research
sources; record author/date, provenance, rights and applicability. Distinguish
research findings, expert practices, central instructions and local measured
results. Recommendations cite passages and explain transfer limits; conflicting
evidence and unknowns remain visible. Purchasing-behavior hypotheses become
bounded tests, not universal uplift constants. Check retrieval quality and rights
before ingesting sources; no invented academic references.

## V5-02 — photo-assisted field observations

**Priority:** P2. **Depends on:** `TECH-04`, `V4-05`, `V5-01`.
**Additional gate:** representative permitted field photos and a reviewed eval set.

Acceptance: analyze an explicitly selected store/fixture image for visible
presentation, fill and signage cues with regions and uncertainty; compare with
the intended plan where available. Ask the manager to confirm observations.
Photos cannot establish hidden stock, remaining shelf life, food safety or
precise dimensions. Never overwrite counts/geometry or identify/profile shoppers.
Test poor light, occlusion and ambiguous produce, and record model/version and
permissioned source links with the observation.

## V5-03 — visual merchandising proposals and bounded simulation

**Priority:** P2. **Depends on:** `V4-07`, `V4-08`, `V5-02`.
**Additional gate:** reliable dimensions, constraints and measured response data.

Acceptance: present a few visual alternatives anchored to the real versioned
layout, explain the field work and retain hard constraints. Label generated
views as proposals, never as actual photographs or execution evidence. Numeric
what-if results use versioned deterministic models with uncertainty and refuse
unsupported precision. Publication and any linked test require human action;
neither rendering nor simulation changes operational state.

## V5-04 — actionable anomaly follow-up

**Priority:** P2. **Depends on:** `V4-04`, `V4-08`.
**Additional gate:** sufficient historical coverage and a false-alert evaluation.

Acceptance: identify unusual waste, stock/forecast divergence or execution
deviation with source age and missing-data guards. Reuse the same bounded
briefing/notification budget; deduplicate, allow defer/dismiss and evaluate
precision, response effort and utility. Ask for evidence or propose a test when
causes are uncertain; do not trigger supplier orders or autonomous intervention.

## Deferred choices

Provider accounts, regions and budgets; actual field devices; representative
PDF variations; optional aggregate transaction data; geographic coverage and
terms of external context sources; and sufficient evidence for causal methods
remain explicit implementation prerequisites. Their absence does not block
planning or sanitized technical tests and must never be replaced with invented
production observations.
