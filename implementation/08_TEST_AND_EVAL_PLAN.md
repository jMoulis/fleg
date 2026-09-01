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

## AI evals later
- numeric answer matches tool result
- answer cites period/store context
- refuses unauthorized cross-store request
- expresses uncertainty when history insufficient
- state-changing request returns draft, not mutation
