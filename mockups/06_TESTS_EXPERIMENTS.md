# UX reference — Tests & Expériences

## Mobile-first intent
Mobile is for creating a test in the aisle, confirming execution, adding observations/photos and reading a concise verdict. Desktop is for designing baselines, comparing evidence and analyzing results.

## Screen M — Tests list
Header: store, current period, `+ Nouveau test`.
Tabs: À préparer / En cours / À analyser / Terminés.

Experiment card:
- title.
- product/family.
- location e.g. `TG1`.
- dates.
- status badge.
- primary KPI.
- if analyzed: uplift + evidence quality.
- tap -> detail.

Quick filters: Produit, TG/zone, Type, Verdict.

## Screen M — Create experiment
Wizard optimized for thumb use.

Step 1 — What are we testing?
- title.
- hypothesis suggested from title but editable.
- test type.

Step 2 — Treatment
- products/family.
- fixture/face/TG.
- optional facing/price/promo details.

Step 3 — Period
- start/end.
- baseline method with simple explanation.

Step 4 — Success
- primary KPI.
- guardrails.
- expected effect optional.

Step 5 — Review
- clear frozen test card.
- Save draft / Plan test.

## Screen M — Running test
Hero status: `EN COURS · J3/7`.
Execution checklist:
- TG1 confirmed.
- product confirmed.
- price/promo confirmed.
- add photo.
- record issue/confounder.

Do not overload with live uplift while test is incomplete. Show provisional values only if explicitly labeled `provisoire`.

## Screen M — Result
Top card:
`Banane vrac · TG1 · S38`

Hero result:
- Actual CA.
- Expected CA without test.
- Uplift € / %.
- incremental gross margin.
- evidence quality badge.

Guardrail cards:
- margin %.
- markdown €.
- family/department change.

`Pourquoi ce résultat ?` opens evidence drawer.

Bottom action:
- Généraliser.
- Retester.
- Modifier & retester.
- Arrêter.

Manager rationale mandatory for conclusion.

## Desktop — Experiment detail / analysis
Layout:
- left/main 8 columns: analysis.
- right 4 columns: experiment definition + decisions.

Header:
Title, status, owner, dates, store, fixture, product.
Actions: Edit before start / Evaluate / Conclude.

### Section A — Test design
Cards for Hypothesis, Treatment, Baseline, Success criteria.

### Section B — Primary result
Bullet chart: actual vs expected with practical target marker.
Never use gauge.

Metrics row:
- revenue uplift.
- quantity uplift.
- gross-margin uplift.
- net incremental value if complete.

### Section C — Time series
Line chart: treatment product over baseline + test period shading.
If control exists, second normalized series allowed.

### Section D — Waterfall economics
Expected gross margin -> incremental sales margin -> markdown impact -> explicit costs -> net incremental value.

### Section E — Guardrails
Compact table/bullet charts, not pies.

### Section F — Evidence quality
Explainable scorecard:
- history depth.
- baseline stability.
- control quality.
- execution compliance.
- confounders.

### Section G — Conclusion
System suggestion is visually secondary to manager verdict.
Final decision plus rationale and reusable learning tags.

## Desktop — Experiment portfolio
Table columns:
- Status.
- Test.
- Product/family.
- Type.
- Fixture/zone.
- Start/end.
- Primary uplift.
- Margin uplift.
- Evidence quality.
- Verdict.
- Decision.

Features:
- pinned Test/Status.
- multi-filter.
- sort.
- grouping by type/product/fixture.
- saved views.
- export.
- open side panel.

Recommended charts above table:
- horizontal bar: best/worst validated experiments.
- scatter: uplift % vs incremental margin €; size by test revenue.
- heatmap: fixture x family measured effects when enough tests exist.

Do not render a heatmap before sample counts are sufficient; show count per cell and suppress weak cells.
