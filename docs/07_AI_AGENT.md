# 07 — Copilote OpenAI

## Role
Analytical copilot, not autonomous store operator.

## Tools
- getStoreKpis
- getProductMetrics
- getProductHistory
- getMarkdownDrivers
- getSpaceAllocations
- getCommercialEvents
- compareAuthorizedStores
- explainRecommendation
- createDraftActionPlan

Every tool receives authorization context server-side; model cannot choose arbitrary tenant IDs.

### AI-01 read-only contract
AI-01 implements the first eight tools as a model-provider-neutral server registry. `createDraftActionPlan` is intentionally separate because it persists a document and belongs to AI-03.

Store-tool inputs contain only business filters such as period, product, date range and result limit. The server injects the authorized store context and requires `ai.use` plus `analytics.read`. `compareAuthorizedStores` receives an exact preauthorized context set, never model-selected store identifiers, and additionally requires `analytics.compare_stores` on every store.

Every result contains:
- `readOnly: true`;
- the authorized `storeIds` actually queried;
- source references with periods, revisions and calculation versions when available;
- explicit `observed`, `calculated` and `inferred` field paths;
- machine-readable limitations for missing data, monthly granularity and incomplete coverage.

The AI-01 executor performs no write, audit mutation or recommendation-run persistence. Provider orchestration and the Copilot interface belong to AI-02.

### AI-02 Copilot contract
AI-02 connects the provider through the official OpenAI SDK and the Responses API. `OPENAI_MODEL`, output-token budget, reasoning effort, tool-round budget and timeout are explicit server configuration; the API key never enters a React payload or browser bundle. The output-token budget includes both visible output and reasoning tokens, and incomplete provider responses are handled as provider failures rather than invalid user conversations. Responses are created with storage disabled, and stateless tool continuation preserves the full replayable provider output, including encrypted reasoning items where required.

Store chat accepts only a bounded `messages` history and an optional business period. The route derives the authorized store from the URL and server session, then exposes only the seven store-scoped AI-01 read tools. A request cannot place `storeId` inside a model-controlled tool argument.

Network chat accepts an explicit, duplicate-free store-id set at the application boundary. That exact set is reauthorized for `ai.use`, `analytics.read` and `analytics.compare_stores` before the single `compareAuthorizedStores` tool is exposed. The model receives the number of stores, but never controls or receives the authorization scope as a tool argument.

Both interfaces show:
- the analytical answer;
- each tool consulted;
- evidence source, period, data revision, calculation version and record count when available;
- observed, calculated and inferred field counts;
- every limitation returned by the deterministic tools;
- a clear read-only and manager-approval boundary.

No AI-02 read request writes a business document, recommendation run or audit record.

### AI-03 draft and approval contract
AI-03 adds `createDraftActionPlan` only to the store Copilot. The model may call it only after an explicit user request and after at least one store read tool has returned evidence. The dedicated UI action transmits a bounded `draft_action_plan` intent: the server forces a deterministic KPI read first, then the draft tool, so the model cannot replace an already explicit request with another confirmation question. Its input contains plan wording, action kind, expected effect and confidence, but never tenant identifiers or authorization fields.

The server injects `organizationId`, `storeId`, actor, model and prompt version. It also replaces any model-supplied notion of evidence with the exact evidence, semantics, limitations and data revisions returned earlier in the same bounded tool loop. A plan with no deterministic evidence is refused.

Creation persists an `aiActionPlans` document with `status: draft` and `executionStatus: not_executed`, then writes an audit entry. It does not modify products, allocations, commercial events, experiments, stock or orders.

Approval and rejection use a separate deterministic route requiring `recommendations.approve`, a rationale and an idempotency key. The decision updates only the plan status, records an immutable decision snapshot and writes an audit entry. Even an approved plan remains `not_executed`; any operational mutation must use its normal authorized workflow.

## Output requirements
For recommendations:
1. observation,
2. evidence,
3. interpretation,
4. proposed action,
5. expected effect if measurable,
6. confidence,
7. limitations.

## State changes
AI-03 creates evidence-backed drafts only. Approval remains a separate deterministic server action with permission check and audit; no plan action is executed automatically.

## Guardrails
- Never fabricate sales or space data.
- Explicitly say when monthly granularity prevents a strong conclusion.
- Separate observed vs inferred.
- Cross-store comparisons normalize for available area/capacity where possible.
- No autonomous purchase order in MVP.

## Evals
Golden questions:
- Why did margin fall?
- Which 10 products should I push next month?
- What should leave TG1?
- Which store has abnormal markdown?
- Why is this product classed AY?
Check groundedness, numeric consistency, tenant isolation and recommendation reproducibility.
