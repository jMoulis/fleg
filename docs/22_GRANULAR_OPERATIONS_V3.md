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

The first accepted source is a daily Mercalys-compatible XLSX or CSV export.
Required logical columns are:

- product label or stable source product key;
- business date;
- quantity;
- sales revenue;
- gross margin.

An optional source margin ratio is retained only for reconciliation. Product
identity continues to use canonical products and source aliases. Multiple
source rows for one product and date are grouped after aggregate-row exclusion.

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

Planned routes:

- `POST /api/stores/:storeId/imports/daily/preview`;
- `POST /api/stores/:storeId/imports/daily/:importId/commit`;
- `GET /api/stores/:storeId/sales/daily?from&to&productId?`;
- `GET /api/stores/:storeId/sales/weekly?from&to&productId?`;
- `GET /api/stores/:storeId/sales/reconciliation?period=YYYY-MM`.

Preview requires `imports.create`, commit requires `imports.commit`, and sales
reads require `analytics.read`. Route parameters never supply organization or
authorization scope.

### V3-01 non-goals

- no dashboard or recommendation switch to daily data;
- no true XYZ classification yet;
- no stock, weather, promotion or order mutation;
- no timestamp-to-business-date inference;
- no automatic replacement of a covered range;
- no supplier integration.

## V3-02 — Stock snapshots boundary

Stock is an observed source, not a value derived from sales. Planned snapshots
record `observedAt` in UTC, source business date, on-hand quantity and optional
on-order/reserved quantities. Missing optional quantities remain null. Negative
on-hand values are preserved as anomalies rather than silently clamped.

Snapshots are append-only and scoped by organization, store and product. Stock
availability and stockout signals always expose the observation age and source;
they do not backfill missing days.

## V3-03 — True XYZ boundary

True XYZ uses weekly unit demand derived from complete daily windows:

`CV = population standard deviation(weekly quantity) / mean(weekly quantity)`

Window length, minimum complete weeks, small-mean protection and X/Y thresholds
are store-configurable and versioned. A window with insufficient coverage,
non-positive mean demand or unresolved negative corrections returns an
unclassified result with warnings. The existing monthly stability proxy remains
visibly distinct.

## V3-04 to V3-06 boundaries

Day-of-week forecasts consume versioned daily facts and preserve training
windows, coefficients, confidence and error metrics. Promotion and weather are
separate contextual observations with source provenance; missing context is not
neutral evidence. Order suggestions combine forecast, stock and operational
constraints only after those sources are reliable. They remain auditable drafts
requiring explicit manager approval and never create supplier orders.

## Required source evidence before parser implementation

At least one anonymized representative daily export is required to confirm
actual header names, date encoding, zero-sales-day behavior, aggregate rows and
whether corrections/returns are negative rows. Until then, the canonical
contract above is stable but source-specific aliases remain provisional.
