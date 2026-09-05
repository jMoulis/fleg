# Experiment Engine — implementation contract

## Architectural rule
Experiment evaluation is a deterministic domain service. React components and the AI layer must not implement uplift formulas.

Suggested package boundary:
`src/modules/experiments/`
- `domain/`
- `services/experiment-service.ts`
- `services/baseline-service.ts`
- `services/evaluation-service.ts`
- `repositories/experiment-repository.ts`
- `schemas/*.ts`
- `queries/*.ts`

## Collections
### `experiments`
One document per test definition and lifecycle.

Important fields:
- organizationId, storeId, departmentId.
- title, hypothesis, type.
- status.
- ownerUserId.
- productIds[] / family filters.
- treatmentPlan.
- treatmentActual.
- plannedStartAt/plannedEndAt.
- actualStartAt/actualEndAt.
- primaryMetric.
- secondaryMetrics[].
- guardrailMetrics[].
- baselineConfig.
- controlConfig optional.
- explicitCostsCents optional.
- confounders[].
- linkedCommercialEventId optional.
- linkedRecommendationId optional.
- linkedDecisionIds[].
- createdAt/updatedAt.

### `experimentAnalyses`
Append-only analysis snapshots.

Fields:
- organizationId/storeId/experimentId.
- analysisVersion.
- engineVersion.
- analyzedAt.
- period windows.
- baselineMethod.
- evidenceQuality.
- metrics[].
- economics.
- warnings[].
- evidenceRefs[].

Unique index: `{ experimentId:1, analysisVersion:1 }`.

### `experimentConclusions`
Prefer append-only conclusion record with exactly one active conclusion unless corrected.

Fields:
- experimentId.
- analysisId.
- systemSuggestedVerdict.
- managerVerdict.
- managerDecision.
- rationale.
- reusableTags[].
- actorUserId.
- concludedAt.

Indexes:
- unique active conclusion by `{ organizationId, storeId, experimentId, active }`;
- idempotent conclusion command by `{ organizationId, storeId, idempotencyKey }`.

## Indexes
`experiments`
- `{ organizationId:1, storeId:1, status:1, plannedStartAt:-1 }`
- `{ organizationId:1, storeId:1, productIds:1, plannedStartAt:-1 }`
- `{ organizationId:1, storeId:1, type:1, plannedStartAt:-1 }`
- `{ linkedCommercialEventId:1 }` sparse

`experimentAnalyses`
- unique `{ experimentId:1, analysisVersion:1 }`
- `{ organizationId:1, storeId:1, analyzedAt:-1 }`

## Deterministic evaluation API
```ts
interface EvaluateExperimentInput {
  experimentId: string;
  asOf: Date;
}

interface MetricEvaluation {
  metric: ExperimentMetric;
  actual: number;
  expectedWithoutTest: number | null;
  absoluteUplift: number | null;
  relativeUplift: number | null;
  baselineMethod: BaselineMethod;
  quality: EvidenceQuality;
  warnings: string[];
}
```

Evaluation service steps:
1. authorize store context.
2. load frozen experiment definition.
3. verify actual test period is complete.
4. load treatment-period facts.
5. build baseline windows.
6. validate denominator/sample sufficiency.
7. apply trend normalization when supported.
8. calculate metric evaluations.
9. calculate economics.
10. grade evidence quality.
11. write append-only analysis snapshot.

## V1 baseline algorithm
For a weekly test with weekly/daily facts available:
- select configurable number of prior comparable weeks, default 4.
- exclude known experiment-overlap weeks if possible.
- use median or trimmed mean when >=4 comparable periods; otherwise mean.
- optionally normalize by department trend:
  `expected = productBaseline * (departmentTest / departmentBaseline)`
  but only if department control denominator is stable.

For monthly-only facts, the engine may evaluate only tests whose windows align with available periods. Otherwise status becomes `awaiting_data` and UI explains why.

## Guardrails
A positive revenue uplift does not automatically mean winner.
Suggested default rule engine for `systemSuggestedVerdict`:
- `winner`: primary uplift meaningfully positive AND no configured critical guardrail breach.
- `promising`: positive but evidence quality medium/low or a mild guardrail concern.
- `neutral`: effect inside configured practical threshold.
- `loser`: negative primary effect or material economic damage.
- `inconclusive`: insufficient/confounded data.

Thresholds are configuration, not hard-coded truths.

## State transitions
- draft -> planned: required definition valid.
- planned -> running: explicit start, capture actual treatment snapshot.
- running -> awaiting_data: end reached but facts incomplete.
- running/awaiting_data -> analyzed: analysis snapshot exists.
- analyzed -> concluded: manager verdict recorded.
- concluded -> archived: optional housekeeping only.

Every transition is audited.

## Scheduled processing
A periodic job may detect ended experiments and queue analysis. This is not a user notification requirement; analysis can also be triggered on demand.

Idempotency key for automatic analysis should combine experiment id + data revision + engine version.

## API routes
- `GET /api/stores/:storeId/experiments`
- `POST /api/stores/:storeId/experiments`
- `GET /api/stores/:storeId/experiments/:experimentId`
- `PATCH /api/stores/:storeId/experiments/:experimentId`
- `POST /api/stores/:storeId/experiments/:experimentId/start`
- `POST /api/stores/:storeId/experiments/:experimentId/finish`
- `POST /api/stores/:storeId/experiments/:experimentId/evaluate`
- `GET /api/stores/:storeId/experiments/:experimentId/analyses`
- `POST /api/stores/:storeId/experiments/:experimentId/conclude`
- `POST /api/stores/:storeId/commercial-events/:eventId/create-experiment`

## UI route proposal
Mobile:
- `/s/[storeId]/tests`
- `/s/[storeId]/tests/new`
- `/s/[storeId]/tests/[experimentId]`

Desktop uses same route with enhanced composition, not a separate product.

## Acceptance test: Banana TG1
Fixture: TG1, product Banane vrac, one-week test.
Acceptance:
- manager can define hypothesis and dates.
- treatment is linked to TG1.
- baseline configuration is visible before start.
- start freezes actual treatment snapshot.
- after facts exist, evaluation returns actual/expected/uplift for revenue and gross margin.
- markdown is visible as guardrail/economic adjustment when present.
- evidence-quality reason is readable.
- manager can conclude `roll_out` or `repeat`.
- result is linked to Decision Log and future product evidence.
