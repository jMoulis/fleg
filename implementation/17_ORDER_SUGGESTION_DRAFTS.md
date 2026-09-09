# V3-06 — Evidence-backed order suggestion drafts

## Operational source and objective

The fruit-and-vegetable department optimizes freshness and markdown reduction
through just-in-time flow. The theoretical target is that the quantity received
is sold during its coverage day or days. V3-06 therefore defaults to zero target
closing stock; it does not silently add a conventional safety stock.

The morning sequence is explicit:

1. sort and remove unsuitable merchandise;
2. count reserve cases, then shelf remainder;
3. prepare and approve the next-delivery order draft before 09:30 local time;
4. process the current-day arrival after ordering.

The current-day arrival is not part of the morning count and has no reliable
system source. V3-06 persists the explicit assumption that this arrival is
earmarked for current-day demand and excludes it from the next-delivery
calculation. This limitation is visible on every draft.

## Delivery calendar

The observed schedule is `A for B`, with no Sunday delivery:

- Monday through Thursday orders cover the following day;
- Friday order is delivered Saturday and covers Saturday plus Sunday;
- Saturday order is delivered Monday and covers Monday;
- Sunday is not an ordering day.

Bank holidays and exceptional supplier closures are not inferred in V3-06.
The schedule and cutoff are persisted with a version on every draft.

## Calculation

For each product, V3-06 requires:

- an active stock snapshot committed for the exact order date;
- the stock unit and pack size copied into that snapshot;
- a V3-04 forecast for every covered sales date.

With a configurable target-closing-stock ratio that defaults to zero:

`targetClosingStock = coveredDemand * targetClosingStockRatio`

`netNeed = max(0, coveredDemand + targetClosingStock - morningOnHand)`

`suggestedCases = ceil(netNeed / snapshotPackSize)`

`suggestedQuantity = suggestedCases * snapshotPackSize`

`projectedClosingStock = morningOnHand + suggestedQuantity - coveredDemand`

An unavailable input remains unavailable rather than becoming zero. Negative
on-hand evidence blocks the line. Low-confidence forecasts may produce an
editable draft but retain their confidence and warnings. Pack rounding surplus
is always visible.

## Persistence and decisions

`orderSuggestionDrafts` stores the full input snapshot, calculation,
coefficients, source revisions, forecast evidence, limitations and generated
lines. Replaying the same input revision/configuration is idempotent.

Draft generation and approval require an authorized manager permission. An
approval may override case counts, but every changed line requires a reason.
The decision, actor and audit evidence are stored transactionally. Approval
never sends, exports or creates a supplier order.

## API and user experience

- `GET /api/stores/:storeId/order-suggestions?orderDate=YYYY-MM-DD`;
- `POST /api/stores/:storeId/order-suggestions`;
- `POST /api/stores/:storeId/order-suggestions/:suggestionId/approve`.

The workspace requires `analytics.read` and `inventory.read`. Generation and
approval additionally require `recommendations.approve`. Product and draft
references are always revalidated inside the authorized store scope.

The page shows the four-step morning sequence, exact delivery/coverage dates,
stock and forecast evidence, suggested cases, unavoidable rounding surplus,
limitations and the explicit non-execution guarantee.

## Verification

- pure tests for the Monday-to-Saturday calendar and Sunday exclusion;
- pure tests for zero-stock-flow, stock subtraction and pack rounding;
- missing, negative and low-confidence evidence tests;
- idempotent persistence, override audit and foreign-store isolation;
- responsive E2E for Friday weekend coverage and Saturday-to-Monday delivery;
- full lint, strict typecheck, unit suite, production build and E2E suite.
