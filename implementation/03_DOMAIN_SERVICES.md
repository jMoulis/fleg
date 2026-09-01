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
