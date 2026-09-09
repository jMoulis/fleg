# V3-04 day-of-week forecast — implementation contract

## Delivery boundary

Implement an authorized daily-quantity forecast over active V3-01 facts. Expose
its backtest and confidence before any recommendation or ordering consumer is
allowed to use it. Do not add promotion, weather or order logic in this ticket.

## Model

For every product and weekday, use the observed same-weekday quantities in the
candidate window. Each observation receives:

`weight = recencyDecay ^ ageInWeeks`

The prediction is their weighted mean when the configurable minimum observation
count is met. Missing dates are absent evidence, not zero. A product with a
negative active quantity is blocked rather than silently corrected or clamped.

Default settings:

- candidate training window: 12 weeks;
- fixed holdout: final 2 weeks;
- minimum observations per weekday: 4;
- minimum usable holdout predictions: 7;
- weekly recency decay: 0.90;
- high-confidence maximum WAPE: 20%;
- medium-confidence maximum WAPE: 40%.

Every setting is bounded by Zod, editable in store settings and attached to the
result through the derived configuration version.

## Backtest and confidence

The fixed-holdout model fits only dates before the holdout and predicts observed
holdout dates. It exposes actual, prediction, error and absolute error per date,
then MAE, RMSE, mean error and WAPE. WAPE is null when actual holdout demand is
zero.

High confidence requires a complete forecast horizon, complete training and
holdout coverage, the configured number of usable points and WAPE at or below
the high threshold. Medium requires a complete horizon, enough usable points
and WAPE at or below the medium threshold. Partial coverage therefore caps
confidence below high. Every other result is low confidence.

After backtesting, the production model refits on the entire candidate window
through `asOf` and forecasts the requested 1-to-28-day horizon. An incomplete
horizon has a null total so it cannot masquerade as a complete forecast.

## API and authorization

`GET /api/stores/:storeId/products/day-of-week-forecast?asOf=YYYY-MM-DD&productId=...&horizonDays=7`

The route requires `analytics.read`. Scope comes exclusively from
`AuthorizedStoreContext`, and a supplied product is revalidated inside the
authorized organization/store. Historical reads never consume facts after
`asOf`. The response freezes windows, weekday models, configuration version,
data revision, model version, backtest and typed warnings.

## User experience

Product detail shows the next seven dates, predicted quantity or explicit
unavailability, observation counts, horizon total, confidence, MAE, WAPE,
windows, revisions and warnings. Labels distinguish this daily quantity model
from the existing monthly revenue forecast.

## Persistence and downstream use

No collection is added. The response is a deterministic derived view over
active daily facts, current products and current versioned settings. V3-04 does
not change recommendation or order inputs; those consumers may adopt this model
only after its evidence is visible and tested.

## Verification

- pure unit tests for weekday means, holdout isolation and error metrics;
- partial/sparse/zero/negative/corrected evidence tests;
- configuration and query boundary tests;
- adversarial foreign-product/store E2E returning 404;
- responsive product-detail acceptance on mobile and desktop;
- full lint, strict typecheck, unit suite, production build and E2E suite.
