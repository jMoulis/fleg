# V3 granular data foundation — implementation contract

## Delivery boundary

Implement `V3-01` without changing existing monthly analytics results. The
first shippable slice is:

`authorized daily upload -> preview/reconciliation -> alias resolution -> idempotent commit -> daily coverage -> weekly read view`

## Additive collections

### `dailySalesImportJobs`

Required fields:

- `organizationId`, `storeId`, `departmentId`;
- `datasetKind: "daily_sales"`;
- raw `fingerprint` and deterministic `coverageKey`;
- source file metadata without file contents;
- immutable normalized preview and coverage snapshot;
- unresolved aliases;
- `status: "preview" | "committed"`;
- actor/timestamps and committed result.

Indexes:

```ts
{ organizationId: 1, storeId: 1, fingerprint: 1, coverageKey: 1 } unique
{ organizationId: 1, storeId: 1, status: 1, createdAt: -1 }
```

### `dailySalesFacts`

Required fields follow `docs/22_GRANULAR_OPERATIONS_V3.md`. Indexes:

```ts
{ organizationId: 1, storeId: 1, productId: 1, businessDate: 1 }
  unique where active = true
{ organizationId: 1, storeId: 1, productId: 1, businessDate: 1, version: 1 } unique
{ organizationId: 1, storeId: 1, businessDate: 1, active: 1 }
{ organizationId: 1, storeId: 1, isoWeekKey: 1, active: 1 }
{ importJobId: 1, active: 1 }
```

The partial unique index is mandatory. Repository code must not depend on a
client-provided store, department or organization identifier.

## Domain modules

Create pure, testable modules for:

- daily date parsing and ISO week-year derivation;
- header mapping and daily row normalization;
- per-date aggregate-row detection and reconciliation;
- coverage classification without zero filling;
- product-date grouping;
- weekly aggregation and evidence warnings;
- monthly-vs-daily reconciliation.

All external schemas are strict Zod schemas. Quantities are finite numbers;
money uses safe integer cents. Business dates and range order are validated.

## Repository transaction

Commit uses the official MongoDB driver and one transaction:

1. load the import by `_id`, `organizationId` and `storeId`;
2. return the stored result when already committed;
3. validate the exact alias resolution set;
4. load active facts for included product-date keys;
5. skip keys whose normalized values are unchanged;
6. deactivate changed active facts and insert their next versions;
7. persist the committed result and source/coverage snapshot;
8. increment `stores.dataRevision` once only when facts changed;
9. append `daily_sales.import.committed` audit metadata.

The audit snapshot contains counts, totals, coverage and fact identifiers, not
the whole uploaded file. Failed or partial transactions leave no active-fact
changes.

## Read services

Daily and weekly repositories require an `AuthorizedStoreContext` and bounded
date ranges. Default and maximum ranges are explicit in schemas. Responses
include data revision, grain, calculation version and coverage warnings.

Weekly reads use active daily facts only. They calculate ISO boundaries from
plain business dates and never rely on server locale or local time zone.

## User experience

Extend the Imports page with an explicit “Ventes journalières” source. Preview
must show range, observed days, missing/unknown coverage, excluded aggregates,
alias queue and reconciled totals before commit. Loading, empty, validation,
conflict and success states are required on mobile and desktop.

Add a read-only granular coverage panel after commit. Do not replace existing
monthly dashboard cards in this ticket.

## Tests

### Unit

- leap day and ISO week-year boundaries;
- French/Excel date normalization without implicit timestamp conversion;
- money, quantity and duplicate product-date grouping;
- per-day aggregate exclusion;
- coverage complete/partial/unknown;
- weekly totals and partial-week warnings;
- monthly reconciliation and zero-denominator guards.

### Integration/isolation

- preview and commit always use authorized store scope;
- foreign import, product or store identifiers return not found/forbidden;
- replayed commit is idempotent;
- corrected rows create a new fact version and one active fact;
- unchanged rows do not increment data revision;
- monthly `salesFacts` remains untouched;
- two stores importing the same bytes remain independent.

### E2E

At both 390 px and 1440 px:

1. import a daily fixture spanning an ISO week boundary;
2. resolve one new alias;
3. inspect coverage and an excluded aggregate;
4. commit and replay the command;
5. inspect daily and weekly totals;
6. verify the monthly dashboard remains on its observed monthly source;
7. substitute another authorized store ID and confirm object isolation.

## Entry requirement

Before source-specific parser aliases are finalized, obtain one anonymized daily
Mercalys export and record:

- header row and actual column labels;
- date cell types and locale;
- treatment of days without sales;
- return/correction sign convention;
- daily subtotal and whole-period total rows.

If the sample is unavailable, implement only the canonical fixture profile and
label the Mercalys header mapping provisional.
