# 07 — AI SDK Copilot

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
AI can create drafts. Approval is a separate deterministic server action with permission check and audit.

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
