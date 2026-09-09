# V3-02 manual stock snapshots — implementation contract

## Source evidence and boundary

Mercalys does not expose fruit-and-vegetable stock. The operational source is
the physical count performed each morning before ordering. A cadencier photo
confirmed that articles can be managed by kilogram or piece and that `CDT`
represents the quantity in one case (for example 18.5 kg or 9 pieces).

The first boundary deliberately excludes PLU and permanent/complementary range
classification. Internal family codes are limited to `3400` (fruit) and `3402`
(vegetables). On-order and reserved stock have no reliable source and stay null.

## User workflow

1. choose the business date;
2. start a persistent draft, or a correction after an earlier commit;
3. configure missing article family, base unit and pack size;
4. count reserve cases, then enter the remaining shelf quantity;
5. review the calculated total and any anomaly;
6. save the draft or explicitly validate it.

Blank is unknown/unobserved. Zero is an observed zero. A counted product must
have both reserve-case and shelf quantities, even when either value is zero.

## Domain rules

`onHandQuantity = reserveCaseCount * packSize + shelfQuantity`

- reserve cases are non-negative integers;
- pack size is positive and finite;
- piece-based pack and shelf quantities are integers;
- kilogram quantities may use decimals;
- a negative calculated total is retained with `negative_on_hand` evidence;
- profile pack size is a prefill only; committed snapshot pack size is history.

Calculations and commit validation live in `src/domain/inventory`, outside React.

## Persistence

- `inventoryProductProfiles`: current manual family, unit and last pack size;
- `inventoryCounts`: optimistic persistent drafts and immutable committed versions;
- `stockSnapshots`: append-versioned product/date observations;
- `inventoryCommands`: store-scoped idempotency snapshots;
- `auditLogs`: start, draft-save and commit evidence.

Commit runs in one MongoDB transaction. It validates every product against the
authorized store, plans changed fact versions, deactivates superseded active
facts, inserts new snapshots, updates current profiles, locks the count,
increments store data revision when facts changed and appends the audit plus
idempotency command.

## Authorization

All repository scopes are derived from `AuthorizedStoreContext`.

- `inventory.read`: page and workspace read;
- `inventory.write`: start, save and commit.

Organization owners/admins receive all permissions. Store directors and
department managers can read/write by default; employees can perform the
physical count; viewers remain read-only.

## Availability evidence

Every workspace product may expose its latest active snapshot, manual source,
calculated observation age and stockout state. Missing observations stay null.
No day is backfilled and no sale is converted into a stock estimate.

## Verification

- strict Zod schemas at every API boundary;
- pure unit tests for quantity semantics, packaging and observation age;
- version-planning tests for unchanged facts and corrections;
- store-scope isolation tests;
- responsive browser recipe for create, save, reload, commit, correction and
  foreign-store rejection.
