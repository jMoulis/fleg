# 12 — Testing & acceptance

## Unit
Seasonality, small-base guard, forecast, ABC, XYZ proxy, margin-after-markdown, effective-space formulas, must-stock preservation, fixture suitability, allocation economics, recommendation rules, photo target contracts and binary signature validation.

## Integration
Better Auth session, organization membership, store authorization, import preview/commit/idempotency, product alias mapping, versioned product-space policies, allocation snapshots and attachment object scope.

## Isolation
Explicit adversarial tests for guessed store IDs and cross-org access.

## E2E
1. Sign in.
2. Select store.
3. Import Mercalys.
4. Resolve mapping.
5. View dashboard.
6. Open product.
7. Review recommendation.
8. Edit layout allocation.
9. Plan TG.
10. Add markdown.
11. Ask AI.
12. Approve draft action.
13. Attach and delete manual store/layout/fixture/event photos.

## Acceptance
- totals reconcile with source after excluded aggregate rows,
- no capacity overflow,
- no incompatible fixture or missing must-stock product in a saved allocation,
- missing markdown remains unknown and visible in allocation evidence,
- private photos cannot be read through another store ID and never mutate layout geometry,
- no cross-store leakage,
- forecast states confidence,
- AI numeric claims are traceable,
- mobile/tablet usable for operational screens.
