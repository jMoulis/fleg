# 17 — Tests & Expériences / Experiment Engine

## Purpose
Turn merchandising, TG, pricing, space and assortment decisions into measurable commercial experiments. The engine must let a manager define a test before execution, capture what actually happened, estimate the counterfactual result without the test, calculate uplift and economics, then record a reusable conclusion.

The module is operational, not academic. It must work with imperfect retail data and must expose uncertainty rather than hide it.

## Core workflow
`draft -> planned -> running -> awaiting_data -> analyzed -> concluded -> archived`

A test can be cancelled at any time before conclusion. A concluded test is immutable except for an appended correction note and recalculation version.

## Example
Test: `Banane vrac en TG1 — S38`
- hypothesis: moving Banane vrac to TG1 increases revenue and gross margin contribution without unacceptable markdown.
- store: one specific store.
- fixture: TG1.
- test period: Monday-Sunday, week 38.
- primary product: Banane vrac.
- baseline: comparable prior weeks and/or configured control.
- primary KPI: revenue uplift %.
- guardrails: margin rate, markdown €, total F&L revenue cannibalization.

## Experiment types
- `tg_placement`: product/theme placed on a TG/endcap.
- `space_change`: facing width or shelf allocation changed.
- `layout_change`: product moved to another face/zone.
- `price_change`: price or promotional price changed.
- `promotion`: explicit commercial mechanic.
- `assortment`: product added/delisted/substituted.
- `presentation`: visual merchandising or display technique changed.
- `custom`: manager-defined test.

## Definition required before start
Every experiment stores a frozen pre-test definition:
- title and business question.
- hypothesis.
- owner.
- store and department.
- products/families involved.
- treatment definition: fixture, face, shelf, facing, price/promo, theme, or free-form intervention.
- planned start/end.
- primary KPI.
- secondary KPIs.
- guardrail KPIs.
- expected effect, optional.
- baseline strategy.
- control strategy, optional.
- notes and attachments/photos.

The actual start/end and actual treatment are captured separately so analysis can detect plan-vs-execution differences.

## Baseline strategies
V1 must support several increasingly robust baselines. The engine chooses only methods supported by available data and shows the method used.

### 1. Prior comparable periods
Expected performance = weighted average of prior comparable periods for the same product/store, adjusted by store/department trend when possible.

Useful when only one store exists and history is limited.

### 2. Same period prior year
Expected performance = prior-year comparable period adjusted by current store/department trend.

Useful for seasonal products but requires sufficient historical continuity.

### 3. Internal category control
Compare treatment product change with change of a stable control basket/family in the same store.

Example:
`normalized uplift = treatment growth - control growth`.

### 4. Control store / matched store
When authorized multi-store data exists, compare with one or more similar stores that did not execute the test.

### 5. Difference-in-differences
Later, when granular history and stable controls exist:
`effect = (treatment_after - treatment_before) - (control_after - control_before)`.

The UI must never display causal certainty if the method does not support it.

## KPI families
### Commercial
- revenue €.
- quantity.
- units/kg depending on product.
- gross margin €.
- gross margin %.
- average selling price when derivable.

### Space productivity
- revenue / effective meter.
- margin € / effective meter.
- quantity / effective meter.

### Loss / operational
- markdown €.
- markdown rate.
- stockout proxy when data exists.
- availability/compliance flags.

### Halo / cannibalization
- total family revenue change.
- department revenue change.
- substitute-product change.
- nearby/related product change when configured.

## Counterfactual and uplift
For every analyzed KPI persist:
- `actual`.
- `expectedWithoutTest`.
- `absoluteUplift = actual - expectedWithoutTest`.
- `relativeUplift = absoluteUplift / expectedWithoutTest` when denominator safe.
- confidence/quality metadata.
- baseline method.
- data window and evidence used.

No relative uplift is calculated on tiny/unsafe denominators. Return a reason instead.

## Economic result
A test result should summarize both sales and economics.

Where available:
`incrementalGrossMargin = actualGrossMargin - expectedGrossMarginWithoutTest`

`netIncrementalValue = incrementalGrossMargin - incrementalMarkdown - explicitExperimentCosts`

Do not invent costs that are not provided. If labor, POS material or supplier contribution are unknown, show net result as partial and list missing components.

## Confidence / evidence quality
V1 uses an explainable evidence-quality grade rather than pretending to have statistical significance from sparse data.

Suggested grade dimensions:
- history depth.
- baseline stability.
- exact date granularity.
- control availability.
- execution compliance.
- concurrent confounders recorded.

Expose `high / medium / low` plus component reasons.

Later, with daily data and sufficient sample size, add bootstrap confidence intervals or model-based intervals without replacing this evidence metadata.

## Confounders
The manager can record factors that may distort interpretation:
- unusual weather.
- holiday/event.
- supplier shortage.
- stockout.
- competitor action.
- major price change.
- simultaneous promotion.
- display execution failure.
- store traffic anomaly.

The system may suggest possible confounders but may not silently discard data.

## Verdict
A conclusion contains:
- verdict: `winner`, `promising`, `neutral`, `loser`, `inconclusive`.
- manager conclusion.
- system evidence summary.
- decision: `roll_out`, `repeat`, `modify_and_repeat`, `stop`, `no_action`.
- reusable learning tags.

System-generated verdict is a recommendation. Final manager conclusion remains explicit and audited.

## Learning loop
Concluded experiments feed the Decision Log and future recommendation evidence. They do not automatically rewrite commercial coefficients.

Later calibration can learn, for example:
- TG1 measured uplift by product family.
- diminishing returns of facing width.
- response to endcap by season.
- effect by store/customer profile.

Any learned coefficient must keep provenance to experiments used in calibration.

## Connections to other modules
### TG Planner
A TG event can be converted into an experiment before publication, or linked later. The experiment freezes the intended treatment and uses the TG event as execution evidence.

### Space Planner
A proposed allocation change can launch a test. Before/after allocation snapshots are attached automatically.

### Product Matrix / Recommendations
A recommendation can create an experiment rather than being immediately generalized. Result links back to the original recommendation.

### Markdown
Markdown during the test window is included in guardrails and net economics.

### Decision Log
Experiment creation, start, modification, verdict and rollout decision create decision-log entries.

### AI Copilot
AI may:
- draft an experiment definition.
- explain analysis.
- identify confounders/evidence gaps.
- suggest a repeat design.
It may not mark a test concluded or roll out a change without explicit user approval.

## Permissions
Add:
- `experiments.read`
- `experiments.write`
- `experiments.start`
- `experiments.conclude`
- `experiments.compare_stores`

Cross-store controls require both `experiments.compare_stores` and `analytics.compare_stores`.

## Audit requirements
Persist immutable snapshots of:
- planned treatment.
- baseline configuration.
- KPI definitions.
- actual treatment at start/end.
- analysis version and calculation inputs.
- final conclusion and actor.

Never recalculate historical experiments silently after analytics logic changes. Re-analysis creates a new `analysisVersion`.

## MVP scope
The first useful implementation must support:
1. create test.
2. link one or more products and an optional TG/fixture.
3. choose test dates.
4. choose primary/guardrail KPIs.
5. baseline using prior comparable periods.
6. automatic post-period analysis.
7. actual vs expected, uplift, margin uplift and markdown.
8. evidence-quality explanation.
9. manager verdict and rollout/retest decision.
10. experiment history searchable by product, fixture and test type.

Control stores, true difference-in-differences and statistical intervals are post-MVP enhancements.
