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
