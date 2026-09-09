# V3-03 true XYZ — implementation contract

## Delivery boundary

Implement true XYZ as an authorized, deterministic read over V3-01 daily sales
facts. Do not change monthly dashboards, forecasts or recommendations in this
ticket. Do not start V3-04.

## Calculation

For each active canonical product:

1. take the configured candidate window ending on the Sunday of the ISO week
   containing `asOf`;
2. load no observation after `asOf`, so a historical read never consumes future
   evidence from the remainder of that week;
3. aggregate active daily unit demand into Monday-to-Sunday ISO weeks;
4. include a week only when all seven product dates are observed;
5. calculate the arithmetic mean, population standard deviation and
   `CV = standardDeviation / mean`;
6. classify X, Y or Z using the configured thresholds.

Missing product dates are unknown, not zero. A complete week with negative net
demand blocks classification. A non-positive or too-small mean also stays
unclassified. Corrected active facts can contribute but carry a warning.

## Store configuration defaults

- candidate window: 13 weeks;
- minimum complete evidence: 8 weeks;
- minimum mean weekly quantity: 1 unit;
- X maximum CV: 0.50;
- Y maximum CV: 1.00;
- above Y: Z.

All values are bounded by strict Zod schemas and editable in store settings.
The minimum complete-week count cannot exceed the candidate window and the Y
threshold must exceed the X threshold. The settings revision derives the
configuration version attached to every analysis.

## API and authorization

`GET /api/stores/:storeId/products/xyz?asOf=YYYY-MM-DD&productId=...`

The read requires `analytics.read`. Organization/store scope comes only from
`AuthorizedStoreContext`. A supplied product is looked up in that exact scope;
foreign and missing products return the same 404 envelope. The response carries
the window, week evidence, warnings, configuration version, data revision and
`true-xyz-v1` calculation version.

## User experience

The product matrix shows ABC and true XYZ as separate columns and filters. Each
XYZ value carries the complete/required week count; insufficient evidence is
shown as “Non classé”. Product detail explains CV, mean weekly demand, evidence
window, warnings and versions, and explicitly distinguishes the monthly
stability proxy.

## Persistence

No new collection. XYZ is recalculated from active `dailySalesFacts`, current
active products and the current versioned store settings. It never overwrites
monthly product metrics or observed facts.

## Verification

- pure unit tests for X, Y and Z plus every eligibility guard;
- schema tests for coherent settings and query filters;
- E2E read after daily import at mobile and desktop widths;
- adversarial product/store isolation returning 404;
- full lint, strict typecheck, unit suite, production build and E2E suite.
