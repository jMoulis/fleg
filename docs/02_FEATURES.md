# 02 — Feature specification

## F01 Authentication & onboarding
Email/password initially; architecture compatible with additional Better Auth providers. Organization creation/join. Store creation. Invite members. Assign store roles.

## F02 Store switcher
Persistent global store context. Authorized stores only. Network mode for authorized users.

## F03 Mercalys import
Upload XLSX/CSV. Detect columns: Libellé, Année/Mois, Quantité, Valeur prix vente, Val Marge, % Marge. Preview, validate, detect duplicate aggregate row, map aliases, commit idempotently.

## F04 Dashboard
CA, margin €, margin %, markdown, target gap, forecast, YoY, seasonality, top actions. Network view adds store ranking and normalized productivity.

## F05 Product matrix
Search/filter/sort. Columns: current CA, historical CA, margin, seasonality, YoY, forecast, ABC, XYZ, recommendation, confidence, allocated space, effective productivity.

## F06 Forecast
Monthly V1 using prior-month current year + prior-year month transition. Small-base protection. Later daily model without schema replacement.

## F07 ABC
Rank by projected CA by default; configurable metric. A <= 80% cumulative, B <=95%, C remainder.

## F08 XYZ
V1 proxy clearly labeled when only monthly data exists. True XYZ later uses coefficient of variation of weekly/daily demand.

## F09 Recommendation engine
push / maintain / reduce / review_margin / review_waste / review_space / delist_candidate / traffic_protect. Every recommendation includes reasons, inputs, confidence and expected effect where calculable.

## F10 Layout editor
Store plan, fixtures, faces, shelves, commercial weights, capacity. Versioned layouts.

## F11 Space optimizer
Recommend facing width subject to fixture capacity, must-stock, minimum facing, locked allocation, product suitability and commercial-zone weights.

## F12 TG planner
Weekly calendar, TG1/TG2/TG3, theme, products, target CA/margin, dates, notes, actual results.

Acceptance criteria for TG-01:
- the available TGs come from the latest authorized store layout;
- a manager can save a draft or explicitly publish an operation with at least one product and one CA/margin target;
- two non-cancelled operations cannot overlap on the same TG, while different TGs can share dates;
- a published operation is immutable except for its notes and realized CA/margin when it is completed;
- cancellation, publication and completion are audited and idempotent;
- all reads and writes are scoped from the server-authenticated store context, never from the client route alone.

## F13 Markdown
Record loss by product/date/reason. Compute post-markdown margin. Pareto loss drivers.

## F14 Decision log
Record what manager changed, why, before/after, expected result and realized result.

## F15 AI Copilot
Grounded analytics Q&A, recommendation explanation, action-plan draft, cross-store comparison when authorized.

## F16 Photos
Attach photos to store/layout/fixture/event. MVP manual reference. Later computer vision may infer presentation state, never silently overwrite geometry.


## F17 Tests & Experiments
Define merchandising/commercial tests before execution, link them to product/TG/space decisions, freeze hypothesis/treatment/baseline/KPIs, evaluate actual vs expected performance, calculate uplift and incremental economics, expose evidence quality/confounders, then record manager verdict and rollout/retest decision. See `17_EXPERIMENT_ENGINE.md`.

Acceptance criteria for EXP-01:
- experiment definitions and every command are validated at the API boundary;
- read, write, execution, conclusion and cross-store comparison permissions remain distinct;
- all experiment queries derive their organization and store scope from the authenticated server context;
- control stores require explicit read access and must belong to the same organization;
- planning, start, finish and cancellation use optimistic concurrency, are idempotent and audited;
- starting freezes the definition and captures the actual treatment snapshot;
- finishing records the actual period and moves the experiment to `awaiting_data` without fabricating an analysis.

Acceptance criteria for EXP-02:
- managers can list tests by preparation, execution, analysis and terminal state;
- a five-step mobile-first flow captures hypothesis, treatment, period, baseline and success criteria;
- a test may be linked to an authorized TG operation and only displays product names, never raw identifiers;
- draft and planned definitions remain editable, while starting freezes the protocol and captures actual execution;
- running tests show execution progress and allow recording deviations and confounders before finishing;
- no provisional uplift is shown before a deterministic analysis exists;
- read-only users can inspect tests without seeing mutation controls.

Acceptance criteria for EXP-03:
- prior comparable windows are derived deterministically from the frozen test period;
- monthly facts are used only when the test covers complete calendar months;
- four or more complete windows use a robust median, otherwise the available windows use a mean;
- missing history and small revenue, margin or quantity denominators remain visible as evidence warnings;
- optional department-trend normalization excludes treatment products and is applied only when its control is complete, sufficiently large and stable;
- engine thresholds and version are store-configurable, with explicit defaults;
- baseline reads are scoped by the server-authorized organization and store context;
- the test detail shows the retained periods and historical reference without presenting it as causal uplift.

Acceptance criteria for MD-01 foundation:
- a manual markdown fact records a positive amount, product, date, optional quantity, reason and notes without modifying sales facts;
- product references are validated inside the authorized organization/store scope;
- capture is idempotent, audited and increments the store data revision;
- reads require store-scoped analytics access and writes require `markdown.write`;
- post-markdown margin subtracts observed markdown from theoretical gross margin without replacing either source fact.

Acceptance criteria for EXP-04:
- evaluation is available only after execution is complete and the full test-period facts exist;
- every analysis is an append-only, versioned snapshot keyed by experiment, data revision and engine version;
- actual, expected, absolute uplift and guarded relative uplift are persisted per configured metric;
- small denominators suppress only the relative uplift and preserve the absolute difference;
- incremental gross margin, incremental markdown, explicit costs and net incremental value remain separate;
- missing markdown or explicit costs produce a partial known-components subtotal, never an invented complete net value;
- evidence quality exposes history depth, baseline stability, date granularity, control quality, execution compliance and confounders;
- the system labels uplift as a counterfactual estimate rather than causal certainty;
- analysis creation transitions `awaiting_data` to `analyzed` and is audited;
- read-only users can inspect saved analysis while only `experiments.start` holders can evaluate or re-evaluate.

Acceptance criteria for EXP-05:
- the system suggestion is derived deterministically from versioned, store-configurable practical, guardrail and economic thresholds;
- the suggestion remains visually secondary and never concludes or rolls out a test autonomously;
- only `experiments.conclude` holders can submit a final manager verdict and rollout, repeat, modify-and-repeat, stop or no-action decision;
- manager rationale is mandatory and reusable learning tags are validated;
- a conclusion must reference the latest analysis and is rejected when the store data revision has changed;
- conclusion is idempotent, transitions `analyzed` to `concluded` and writes the conclusion, experiment update, audit and decision-log snapshot atomically;
- only one active conclusion exists per scoped experiment;
- the mobile result exposes the primary result before the conclusion controls, while desktop keeps the evidence analysis beside the decision panel;
- experiment conclusions and their immutable analysis snapshot are visible in the store Decision Log.

Acceptance criteria for EXP-06:
- control-store baselines are selectable only when at least one other same-organization store is explicitly authorized;
- every control-store read requires `experiments.compare_stores` and `analytics.compare_stores` on the treatment store plus experiment and analytics read access on every frozen control store;
- product matching uses canonical normalized product identity and excludes a control explicitly when any tested product is unmatched;
- a control is included only when its complete before/after monthly windows are available; exclusions and reasons remain visible;
- direct control-store comparison applies the control's relative before/after movement to the treatment baseline;
- difference-in-differences uses `(treatment after - treatment before) - (control after - control before)` and never claims causal certainty;
- analyses snapshot every control data revision and re-analysis creates a new version when treatment or control inputs change;
- evaluation, conclusion, experiment reads and Decision Log reads reauthorize the exact frozen control-store set after permission changes.

Acceptance criteria for NET-01:
- network access requires both store analytics read access and the explicit cross-store comparison permission for every selected store;
- a request containing one unauthorized store or stores from different organizations is rejected in full, never silently reduced;
- network totals include only the server-authorized store set and preserve missing prior-year, markdown and target coverage as unknown rather than zero;
- store ranking uses revenue per confirmed effective commercial meter and never falls back to raw revenue;
- stores without confirmed layout geometry remain visible in totals and comparison but are excluded from the normalized ranking;
- desktop and mobile views expose store-level revenue, margin, year-over-year, markdown, target attainment and current prioritized-action counts;
- the one-store case remains useful for totals and clearly explains that comparison needs at least two authorized stores.

Acceptance criteria for AI-01:
- the server exposes a stable catalog of typed read-only tools for store KPIs, product metrics/history, markdown drivers, space allocations, commercial events, recommendation explanation and authorized-store comparison;
- every tool input and output is validated with strict Zod schemas and every result is explicitly marked `readOnly: true`;
- store identifiers never appear in model-controlled store-tool inputs; the authorized context is injected only by the server;
- store tools require both `ai.use` and `analytics.read`, while network comparison additionally requires `analytics.compare_stores` on every exact authorized store context;
- outputs carry scoped evidence references, data revisions/calculation versions when applicable, explicit limitations and observed/calculated/inferred field semantics;
- monthly granularity, missing history, incomplete normalization and manual-only markdown coverage remain visible instead of being silently inferred;
- recommendation explanation reconstructs the deterministic recommendation without persisting a run or changing business state;
- no mutation or draft-action-plan tool is present in AI-01.

Acceptance criteria for AI-02:
- the store and network Copilot endpoints validate bounded conversations with strict Zod schemas before invoking the model provider;
- store chat derives its store scope from `requireStoreAiContext`, while network chat reauthorizes the exact submitted store set before every comparison;
- neither store identifiers nor authorization context are present in model-controlled tool inputs;
- only the AI-01 read tools are exposed, tool loops are bounded, and no write, approval or draft-action-plan tool is available;
- every answer displays the tools consulted, evidence periods/revisions/calculation versions, observed/calculated/inferred semantics and all returned limitations;
- store and network interfaces expose responsive empty, loading, configuration and error states without exposing the provider API key;
- provider responses use server-only configuration, disable response storage and preserve required reasoning items during stateless tool continuation;
- cross-store questions in store mode are redirected to the authorized network mode, while a one-store network scope remains explicit about its limitation.
