# Mobile-first UI implementation contract

Figma reference file:
https://www.figma.com/design/aQKFkFE3KxQxV0z3c5H1Xu

## Principle
Mobile is the operational interface used in the aisle. Desktop expands analytical density and planning capabilities. Do not shrink desktop tables onto mobile.

## Navigation
### Mobile
Persistent bottom navigation: Home / Actions / Products / Space / More. Store switcher is always reachable from header. Primary actions must be thumb-reachable.

### Desktop
Left navigation rail + persistent organization/store/period context. Analytical pages may use side drawers for drill-down.

## Data tables — desktop
Required capabilities:
- sticky product/name column
- sortable columns
- multi-column sort
- column visibility
- resize/reorder
- grouped headers where useful
- server- or client-side filtering depending dataset size
- quick search
- filter chips with count
- saved views
- row selection and bulk action only when action semantics are safe
- compact/comfortable density
- keyboard navigation
- export CSV/XLSX of currently filtered data
- row drill-down to product detail
- explicit unit formatting (€ / % / qty / m equivalent)
- loading skeleton, empty state, partial-error state

Mobile equivalent = product cards/list with search + filter sheet + sort sheet + progressive disclosure.

## Chart grammar
- **Line / area**: time evolution, actual vs prior year vs target.
- **Horizontal bars**: product/store ranking.
- **Waterfall**: explain margin/CA gap between periods or target.
- **Pareto**: cumulative CA/margin concentration and ABC threshold.
- **Scatter / quadrant**: product decisions (e.g. CA potential vs margin; size can encode space/productivity).
- **Heatmap**: seasonality by month, performance by face/fixture, weekly activity.
- **Treemap**: assortment/revenue mix only when hierarchy matters; never for precise comparisons.
- **Bullet chart**: target vs actual with threshold bands.
- **Stacked bars**: mix composition over time, only when totals and composition both matter.

Avoid decorative pie/donut charts unless there are <=4 stable parts and exact comparison is not important.

## Interaction rules for charts
- mobile tooltip becomes tap/selection card
- desktop hover tooltip + click drill-down
- legends toggle series only when that will not invalidate interpretation
- all chart values available in accessible textual/table form
- color never carries meaning alone; pair with label/icon/pattern/position
- period, unit and comparison baseline always explicit
