# 12 — Testing & acceptance

## Unit
Seasonality, small-base guard, forecast, ABC, XYZ proxy, margin-after-markdown, effective-space formulas, must-stock preservation, fixture suitability, allocation economics, recommendation rules, photo target contracts and binary signature validation.

V3 inventory unit coverage includes reserve-case plus shelf calculation,
kilogram and piece constraints, explicit zero versus unknown blank values,
partial-count rejection, negative-stock anomaly preservation, observation age
and correction-aware stock snapshot versioning.

V3 true-XYZ unit coverage includes X/Y/Z boundaries, population CV, exclusion
of incomplete weeks without zero filling, minimum-history and small-mean
guards, unresolved negative demand and visible corrected-fact evidence.

V3 day-of-week forecast coverage includes weekday weighting, fixed holdout
without leakage, MAE/RMSE/bias/WAPE, confidence thresholds, partial and sparse
coverage without zero filling, zero-denominator protection, negative-demand
blocking and correction evidence.

V3 context coverage includes active and explicit no-promotion observations,
product-scoped joins, latest-weather precedence, bounded measurements,
missing-context preservation, source provenance and deterministic coverage.

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
- no cross-store inventory profile, draft or stock snapshot access,
- no committed inventory count mutation or silent zero filling,
- missing markdown remains unknown and visible in allocation evidence,
- private photos cannot be read through another store ID and never mutate layout geometry,
- no cross-store leakage,
- forecast states confidence,
- AI numeric claims are traceable,
- mobile/tablet usable for operational screens.

## V3-01 granular-data gate

- date parsing covers leap days and ISO week-year boundaries;
- coverage remains partial/unknown when source days are absent;
- commit replay creates no duplicate facts or revision increment;
- corrections create a new version and leave one active product-date fact;
- daily and weekly reads reject foreign store/product/import identifiers;
- complete daily months reconcile to monthly observations without replacing or summing them;
- the daily import-to-weekly-view flow passes at mobile and desktop widths.

## V3-03 true-XYZ gate

- the read uses only complete Monday-to-Sunday product weeks from the configured
  candidate window;
- incomplete dates remain visible and are excluded rather than converted to
  zero demand;
- insufficient, small-base, zero or negative evidence remains unclassified
  with typed warnings;
- a product identifier from another authorized store returns 404;
- matrix and product-detail views show true XYZ separately from ABC and the
  monthly stability proxy;
- thresholds, evidence guards and their configuration revision are visible.

## V3-04 day-of-week forecast gate

- only active authorized daily facts through `asOf` enter the model;
- the holdout is excluded from its own fit and exposes point-level errors;
- incomplete training/backtest coverage cannot receive high confidence;
- missing weekday history returns null days and a null horizon total rather
  than invented zero demand;
- zero backtest demand returns a null WAPE and negative demand blocks the
  forecast with typed warnings;
- a product identifier from another store returns 404;
- mobile and desktop product detail distinguish daily quantity forecasts from
  the existing monthly revenue forecast.

## V3-05 promotion and weather context gate

- promotion and weather writes are separately validated, idempotent and audited;
- store, product and commercial-event references are always reauthorized;
- explicit no-promotion evidence differs from a missing record;
- a later weather observation wins without removing earlier provenance;
- date/product joins expose complete, partial or unknown coverage without zero filling;
- each successful new observation increments the store data revision once;
- foreign-store product joins return 404;
- mobile and desktop expose separate entry, empty, error and evidence states;
- contextual observations do not mutate sales, stock, experiments or forecasts.
