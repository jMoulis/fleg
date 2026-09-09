# 22 — V3 granular operations

## Entry decision

The pre-V3 gate is complete. V3 starts with an additive daily-sales foundation;
it does not reinterpret or replace the monthly `salesFacts` collection.

The delivery order is:

1. `V3-01` — daily sales ingestion and deterministic weekly views;
2. `V3-02` — stock snapshots and explicit availability evidence;
3. `V3-03` — true XYZ from complete granular demand windows;
4. `V3-04` — day-of-week forecasting;
5. `V3-05` — promotion and weather context features;
6. `V3-06` — evidence-backed order suggestions that remain drafts.

## Invariants

- Daily observations, monthly observations, derived weekly aggregates,
  forecasts and recommendations remain separate data semantics.
- A business date is a source-provided local calendar date in `YYYY-MM-DD`.
  V3-01 does not infer a business date from a timestamp without an explicit
  store time zone.
- ISO weeks run Monday through Sunday and use the ISO week-year in keys such as
  `2027-W01`.
- Missing days, stock values, markdown, promotion or weather observations stay
  unknown. They are never filled with zero merely to complete a series.
- Monthly and daily sales for the same period are reconciled, never summed.
- Every read and mutation derives `organizationId` and `storeId` from an
  authorized server context.
- Money remains integer cents and ratios remain decimal values.

## V3-01 — Daily sales foundation

### Source contract

The first accepted source is the observed daily Mercalys XLSX or a compatible
CSV export. Its table starts after metadata rather than on the first row.
Required logical columns are:

- product label or stable source product key;
- business date;
- quantity;
- sales revenue;
- gross margin.

An optional source margin ratio is retained only for reconciliation. Product
identity continues to use canonical products and source aliases. Multiple
source rows for one product and date are grouped after aggregate-row exclusion.
The observed source supplies ITM8 and EAN identifiers. Resolution tries ITM8,
then EAN, then the normalized label, and persists all available aliases after
an explicit create/merge/ignore decision. Monthly imports accept those two
identifier columns optionally without rejecting legacy label-only workbooks.

For the observed non-detailed daily profile, the source business date comes
from `Sélection de données : Du DD/MM/YYYY Au DD/MM/YYYY`. A single-day range
applies to every included article row. A multi-day range requires a per-row
date column and is otherwise rejected. `PDV: <code>` is a source consistency
check against the already-authorized store, never an authorization input.

The preview exposes:

- detected date range and distinct observed dates;
- included and excluded row counts;
- daily and whole-file totals;
- unresolved aliases;
- aggregate rows and margin-ratio inconsistencies;
- coverage as `complete`, `partial` or `unknown` with explicit reasons.

Coverage is `complete` only when every expected calendar date is represented
or the source provides an explicit complete-range marker. A missing date is not
assumed to be a closed-store zero day.

### Canonical fact

`dailySalesFacts` is append-versioned. One active fact may exist for each
authorized store, canonical product and business date.

```ts
interface DailySalesFact {
  id: string;
  organizationId: string;
  storeId: string;
  departmentId: string;
  productId: string;
  businessDate: string;       // YYYY-MM-DD
  periodKey: string;          // YYYY-MM, derived from businessDate
  isoWeekKey: string;         // ISO week-year, e.g. 2027-W01
  quantity: number;
  revenueCents: number;
  marginCents: number;
  source: "mercalys_daily";
  importJobId: string;
  version: number;
  active: boolean;
  supersedesFactId: string | null;
  createdBy: string;
  createdAt: string;
}
```

Corrections deactivate the previous fact and insert a new version in the same
transaction. Absence from a later file does not delete, zero or supersede an
existing observation in V3-01. This safe `upsert_observed` behavior is explicit
in the import snapshot.

### Import identity and revisions

Daily import jobs are separate from legacy monthly jobs in behavior and schema,
while sharing the existing alias catalog. Identity includes authorized store,
dataset kind, raw-file fingerprint and detected coverage key. Replaying a
committed job returns the original result without creating facts or incrementing
the store revision again.

A successful commit:

1. reauthorizes the store and validates the preview snapshot;
2. resolves every included product alias;
3. versions only product-date facts present in the file;
4. records totals, coverage, source fingerprint and affected fact versions;
5. increments `stores.dataRevision` once;
6. appends one request-correlated audit entry.

### Weekly view

Weekly sales are derived from active daily facts and are not a second observed
source. Every result includes:

- ISO week key, start and end dates;
- quantity, revenue and gross margin totals;
- observed dates and coverage status;
- store data revision and calculation version;
- warnings for missing dates, corrections or non-positive net demand.

No consumer may present a partial week as a complete comparable period.

### Monthly compatibility

The existing dashboard, product matrix, recommendations and monthly experiment
engine continue to read `salesFacts` during V3-01. A reconciliation service may
compare a complete daily month with the observed monthly fact and report amount
and ratio deltas. It does not overwrite either source.

Later consumers must select one evidence grain per calculation and expose that
choice. They must never add a daily rollup to the corresponding monthly fact.

### API boundary

Implemented routes:

- `POST /api/stores/:storeId/imports/daily/preview`;
- `POST /api/stores/:storeId/imports/daily/:importId/commit`;
- `GET /api/stores/:storeId/sales/daily?from&to&productId?`;
- `GET /api/stores/:storeId/sales/weekly?from&to&productId?`;
- `GET /api/stores/:storeId/sales/reconciliation?period=YYYY-MM`.

Preview requires `imports.create`, commit requires `imports.commit`, and sales
reads require `analytics.read`. Route parameters never supply organization or
authorization scope.

Daily and weekly range parameters are optional only as a pair. The default is a
28-day window ending on the latest authorized observation and the explicit
maximum is 366 days. Weekly results expand intersecting ISO weeks to their full
Monday-to-Sunday boundaries. The optional `productId` is revalidated against the
authorized organization and store before any fact query.

### V3-01 non-goals

- no dashboard or recommendation switch to daily data;
- no true XYZ classification yet;
- no stock, weather, promotion or order mutation;
- no timestamp-to-business-date inference;
- no automatic replacement of a covered range;
- no supplier integration.

## V3-02 — Stock snapshots boundary

Stock is an observed source, not a value derived from sales. The first source is
the physical morning count performed before ordering: reserve cases are counted
first, then the shelf remainder is added in the article base unit.

Each article has a current, manually maintained operational profile:

- family code `3400` for fruit or `3402` for vegetables;
- base stock unit `kg` or `piece`;
- last known pack size (`CDT`), used only as the next-count prefill.

Pack size can change between orders. The value actually used by a committed
count is therefore copied into its immutable stock snapshot; changing the
current profile never rewrites history. For a complete line:

`onHandQuantity = reserveCaseCount * packSize + shelfQuantity`

An empty quantity means uncounted/unknown. An explicit zero means an observed
zero and may produce a stockout signal. A line with only one count component is
not commit-ready; the system never replaces the missing component with zero.

Counts are persistent drafts with optimistic revisions. Commit locks the count,
updates current article profiles and creates append-versioned stock observations
in one transaction. A correction creates a new count version and supersedes
only changed active product/date snapshots. Unchanged observations are not
duplicated.

Snapshots record `observedAt` in UTC, source business date, on-hand quantity and
the reserve, shelf, unit and pack-size evidence used to calculate it. Planned
`onOrderQuantity` and `reservedQuantity` fields remain null in V3-02 because no
reliable source exists. Negative manual values are retained with a visible
`negative_on_hand` anomaly rather than silently clamped.

Snapshots are scoped by organization, store and product. Availability and
stockout evidence always exposes the source and observation age; missing days
remain unknown and are never backfilled. PLU and permanent/complementary range
classification are intentionally outside this first boundary.

Implemented routes:

- `GET/POST /api/stores/:storeId/inventory/counts`;
- `PATCH /api/stores/:storeId/inventory/counts/:countId`;
- `POST /api/stores/:storeId/inventory/counts/:countId/commit`.

Reads require `inventory.read`; draft creation, update and commit require
`inventory.write`. Every route derives its tenant scope from the authorized
server context.

## V3-03 — True XYZ boundary

True XYZ uses weekly unit demand derived from complete daily windows:

`CV = population standard deviation(weekly quantity) / mean(weekly quantity)`

Window length, minimum complete weeks, small-mean protection and X/Y thresholds
are store-configurable and versioned. A window with insufficient coverage,
non-positive mean demand or unresolved negative corrections returns an
unclassified result with warnings. The existing monthly stability proxy remains
visibly distinct.

This boundary is implemented as a read-only derived view. Defaults are 13
candidate ISO weeks, at least 8 complete weeks, a minimum weekly mean of 1
unit, X at `CV <= 0.50`, Y at `CV <= 1.00`, then Z. The product matrix exposes
an independent XYZ filter and the product detail exposes the mean, CV,
complete-week count, excluded coverage and typed warnings.

Implemented route:

- `GET /api/stores/:storeId/products/xyz?asOf&productId?`.

The route requires `analytics.read`, reauthorizes the optional product and
returns the exact candidate window, calculation/configuration versions and data
revision. No XYZ collection is introduced and no monthly metric is mutated.

## V3-04 to V3-06 boundaries

Day-of-week forecasts consume versioned daily facts and preserve training
windows, coefficients, confidence and error metrics. Promotion and weather are
separate contextual observations with source provenance; missing context is not
neutral evidence. Order suggestions combine forecast, stock and operational
constraints only after those sources are reliable. They remain auditable drafts
requiring explicit manager approval and never create supplier orders.

## Observed source evidence

The first representative export confirmed metadata and headers, a single
business date encoded as `DD/MM/YYYY`, 133 article rows, one reconciled total
row, and a `Nombre de Lignes` footer. It also confirmed that identifiers must
remain strings to preserve leading zeroes. One article has a negative margin
with positive quantity and revenue, so negative business values are preserved
as observations rather than clamped.

Still required for later hardening: an explicit no-sales-day export and a real
return/correction row with negative quantity or revenue. Missing evidence stays
unknown and does not block the confirmed single-day profile.
