# 08 — Analytics & forecasting

## Core metrics
Revenue, quantity, gross margin €, gross margin %, markdown €, post-markdown margin €, YoY, seasonality, forecast, target gap, product mix.

## Seasonality
For comparable product:
`seasonality = CA(target month N-1) / CA(previous month N-1)`

Use reliability guard:
- insufficient base => neutral index / low confidence,
- cap operational index by configurable bounds,
- never hide raw index.

## Forecast V1
`forecastRevenue = currentPreviousMonthRevenue * retainedSeasonality`

Store-level forecast should also expose a global benchmark based on historical store transition so users can see product-level vs aggregate difference.

## ABC
Sort selected metric descending. Cumulative share:
A <= configurable 80%; B <=95%; C remainder.

## XYZ
Do NOT call a seasonality band “true XYZ”.
V1 label: `demand_stability_proxy`.
True XYZ after granular history:
`CV = stddev(demand) / mean(demand)`.
Thresholds configurable.

## V3 granular evidence

Daily observations retain their source business date. ISO weekly aggregates are
derived from active daily facts, use Monday-to-Sunday week boundaries and carry
coverage status plus the store data revision. Missing dates are not zero demand.
The default granular window is the 28 days ending on the latest authorized
observation; explicit windows are capped at 366 days. Weekly queries expose the
full boundaries of every intersecting ISO week, including missing dates,
corrected active facts and non-positive net-demand warnings.

Monthly `salesFacts` and daily rollups are distinct observed/evidence paths. A
reconciliation compares them only for a complete daily month. Incomplete months
retain both observed totals but withhold deltas; zero monthly denominators return
null ratios. An analytical result must choose one grain and must never sum both.

True XYZ uses population standard deviation of complete weekly unit-demand
windows. Window length, minimum complete weeks, small-mean guard and X/Y
thresholds are configurable and versioned. Insufficient coverage or non-positive
mean demand produces an explicit unclassified result.

The implemented defaults are a 13-week candidate window, at least 8 complete
weeks, a minimum weekly mean of 1 unit, X for `CV <= 0.50`, Y for
`0.50 < CV <= 1.00`, and Z above 1.00. A negative complete weekly net demand
blocks classification until resolved. Corrected active facts remain usable but
are surfaced as evidence. The matrix and product detail always display the
complete-week count and keep `demand_stability_proxy` explicitly separate.

## V3 day-of-week quantity forecast

The daily model predicts each future date from a recency-weighted mean of
observed quantities for the same weekday:

`weight = recencyDecay ^ ageInWeeks`

`forecast(weekday) = sum(quantity * weight) / sum(weight)`

Defaults are a 12-week candidate window, a fixed 2-week holdout, at least 4
training observations per weekday, at least 7 predicted holdout observations
and a weekly recency decay of 0.90. The holdout model trains only before the
holdout start, preventing future-data leakage. The production model is then
refitted with all observations through `asOf`.

Backtest evidence includes:

- `MAE = mean(abs(predicted - actual))`;
- `RMSE = sqrt(mean((predicted - actual)^2))`;
- mean error `mean(predicted - actual)`;
- `WAPE = sum(abs(predicted - actual)) / sum(actual)` when actual demand is
  non-zero.

High confidence requires a complete forecast horizon, complete training and
backtest coverage, enough backtest observations and WAPE at or below 20%.
Medium confidence requires a complete horizon, enough backtest evidence and
WAPE at or below 40%; this caps partial coverage below high. Every other case
is low confidence. All windows, minimums, decay and WAPE thresholds are
store-configurable and versioned.

An absent source date remains unknown and never enters the weighted mean as
zero. Insufficient weekday history produces null forecast dates. Negative
demand blocks the product forecast; corrected active facts remain usable when
non-negative but are disclosed. This quantity forecast remains distinct from
the monthly revenue forecast and is not consumed by recommendations in V3-04.

## V3 promotion and weather context

Business context is a derived store/date view over two independent immutable
sources. For a product join, only active promotion observations containing that
product apply. An explicit `none` observation resets earlier promotions on the
same date; later applicable observations remain active. Without an applicable
promotion or an explicit reset, promotion status is `missing`, not false.

Weather selects the most recently recorded observation for the date and exposes
the number of candidate observations so precedence stays visible. Optional
temperature and precipitation fields remain null when not measured. A date is
context-complete only when both promotion and weather are observed. Overall
coverage is `unknown` with no observed feature, `partial` with any gap and
`complete` only when every requested date has both sources.

The feature join carries `business-context-v1` and the current store data
revision. V3-05 does not add these features to day-of-week forecasting,
experiment uplift, recommendations or ordering; that requires a separate
versioned model decision.

## Recommendation score
Do not reduce decisions to one opaque score. Keep components:
- economic weight,
- margin quality,
- seasonal momentum,
- trend,
- markdown penalty,
- space productivity,
- strategic flags,
- confidence.

## Multi-store normalization
Prefer:
- CA/m²,
- post-markdown margin/m²,
- CA/effective display meter,
- margin/effective display meter,
- markdown rate,
- mix-adjusted product comparisons.


## Experiment analytics
Experiment evaluation must distinguish observed actuals from an estimated counterfactual. Persist baseline method, actual, expectedWithoutTest, absolute/relative uplift, evidence quality and warnings per metric. Do not imply causal certainty from simple before/after comparisons. See `17_EXPERIMENT_ENGINE.md`.
