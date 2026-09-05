# Domain services contract

## StoreService
Create/update stores, memberships, objectives and active department metadata.

## ImportService
- parse source file
- detect source type
- map columns
- normalize numeric/text values
- detect period
- detect aggregate rows
- resolve product aliases
- create preview
- commit idempotently
- increment `dataRevision`

## AnalyticsService
Produces reconciled store KPIs, product metrics, ABC classifications, available stability/XYZ proxy, Pareto, margin diagnostics and time comparisons.

## ForecastService
Produces forecast values with component evidence and confidence metadata. Small-base and missing-history guards are mandatory.

## RecommendationService
Produces explicit recommendation objects such as `PUSH`, `REDUCE`, `HOLD`, `MARGIN_WATCH`, `TRAFFIC_PROTECT`, with component evidence rather than one opaque score.

## DecisionService
Records manager decision (`accepted`, `modified`, `rejected`, `deferred`), rationale, before snapshot and later realized outcome.

## SpaceService
Versions physical layout; calculates effective display capacity, allocation, margin/CA per equivalent metre, capacity constraints and before/after scenarios.

## MarkdownService
Stores markdown events and computes post-markdown unit/margin economics without modifying historical sales facts.

## CommercialEventService
Plans TG/endcaps, objectives, product selection and realized performance.

## CopilotService
Exposes only authorized, typed tools. Numeric answers must include source/evidence metadata. Write actions always return a draft.

AI-01 provides separate store and network read executors. Store requests never accept `storeId`; they receive an `AuthorizedStoreContext` from the server and require `ai.use` plus `analytics.read`. Network requests receive an exact context set whose members all require `ai.use`, `analytics.read` and `analytics.compare_stores`.

All request/result variants are Zod discriminated unions. Results include evidence references, data semantics and explicit limitations. `explainRecommendation` uses a non-persisting preview path; no AI-01 tool can create or mutate a business document.

AI-02 wraps those executors in a bounded Responses API tool loop. Store and network conversations use separate strict schemas and prompts; network scope is rechecked against the exact authorized context set before provider invocation. Provider response storage is disabled. The UI renders evidence traces and limitations outside the model prose, so grounding remains inspectable even when answer wording varies.

AI-03 adds one store-only write tool whose sole effect is creating an evidence-backed `draft` with `executionStatus: not_executed`. The service grounds the document from read-tool results collected in the same turn, persists model and prompt versions, and audits creation. Approval/rejection is a separate idempotent service requiring `recommendations.approve`; it records a decision snapshot and audit without executing operational changes.
