# Test & evaluation plan

## Unit
- money/ratio formatting and calculations
- seasonality index
- small-base guard
- forecast function
- ABC/Pareto thresholds
- XYZ/stability proxy
- margin diagnostics
- recommendation rule composition
- space-equivalent formulas
- aggregate row detection

## Integration
- Better Auth session + organization membership
- storeMembership authorization
- scoped repository guards
- import preview -> alias resolution -> commit
- duplicate import idempotency
- analytics cache revision invalidation
- decision log audit record

## Security isolation suite
Generate adversarial tests that substitute random/foreign `storeId`, `organizationId`, product ids and import ids for every API family.

## E2E MVP
`sign in -> select store -> import -> resolve -> commit -> dashboard -> product -> recommendation -> decision log`

Run at mobile and desktop viewport sizes.

## E2E release recipe

Playwright creates one authenticated Better Auth state at suite startup and reuses it across isolated browser contexts. The generated state is stored only under the ignored `test-results/` directory.

The non-billed release suite runs on mobile and desktop and covers:

- `REL-01`: create a new layout version and save an allocation draft;
- `REL-02`: publish and complete a TG operation, then record markdown;
- `REL-03`: plan, start and finish an experiment;
- `REL-04`: open the authorized network dashboard;
- `AI-01`: open the configured Copilot page without exposing server secrets;
- the original Mercalys import-to-decision vertical slice and accessibility checks.

Run `npm run check` followed by `npm run test:e2e`. These scenarios intentionally mutate only the seeded demo store and use unique markers or periods so repeated runs remain traceable.

The real-provider suite remains explicit and opt-in: `npm run test:e2e:ai`. It sends demo analytics to the configured OpenAI project and verifies both a multi-tool grounded answer and an evidence-backed action-plan draft. Approval must leave `executionStatus: not_executed`.

## AI-01 contract and isolation tests
- strict tool inputs reject model-supplied tenant identifiers and duplicates;
- the catalog contains only the eight approved read tools;
- missing `ai.use`, analytics read or network comparison permission rejects execution;
- mixed users, foreign organizations and duplicate network stores reject the whole scope;
- product history, ranking limits and markdown shares remain numerically deterministic.

## AI evals for AI-02
- numeric answer matches tool result
- answer cites period/store context
- refuses unauthorized cross-store request
- expresses uncertainty when history insufficient
- state-changing request is refused as an executable action; an explicit plan request may create only a non-executed draft

AI-02 contract tests also verify that tenant identifiers are rejected from store-chat payloads, duplicate network store sets fail validation, network store identifiers never enter model-controlled inputs, evidence traces survive the tool loop, and repeated tool calls stop at the configured bound.

## AI-03 draft and approval tests
- model-controlled draft inputs reject tenant identifiers and remain bounded;
- a draft call before deterministic read evidence is refused;
- captured evidence belongs to the exact authorized store and is deduplicated;
- a response can create at most one `draft` with `executionStatus: not_executed`;
- approval/rejection requires `recommendations.approve`, rationale and idempotency;
- foreign-store plans and evidence are rejected;
- creation and decision write audit records, while no operational collection is mutated.

## HARD-01 hardening tests

- server environment applies bounded MongoDB pool, connection and readiness settings;
- readiness envelopes distinguish database and index state and expose bounded latency only;
- operational logs validate a structured envelope and redact credentials and tokens;
- required query indexes are included in the idempotent foundation bootstrap;
- security headers disable framework disclosure, framing and API caching;
- keyboard skip navigation and reduced-motion behavior remain part of E2E accessibility checks.
