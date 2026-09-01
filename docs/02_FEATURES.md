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
