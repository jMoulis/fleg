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
