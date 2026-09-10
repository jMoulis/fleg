# UX-LIST-01 — scalable morning inventory workflow

## Problem

The first V3-02 interface rendered every active product and every configuration
and count field at once. A store with 587 active product records therefore
produced hundreds of cards and more than ten thousand accessibility nodes. The
save and commit controls were declared after that list, so their sticky behavior
only started after the user had reached them in document order.

The interface also grouped reserve and shelf inputs by product, while the
observed morning workflow consists of two physical passes: the employee counts
cases in the reserve first, then walks the aisle to count the shelf remainder.

## Scope

`UX-LIST-01` changes only the presentation and client-side workflow of the
existing authorized V3-02 inventory boundary. It does not change stock
calculation, persistence, tenancy, permissions, versioning or audit semantics.

The delivered workflow has four views:

1. **Reserve** — configured products, today's pack size and reserve case count;
2. **Shelf** — configured products, reserve subtotal and shelf remainder;
3. **Review** — complete, partial, uncounted and explicit-stockout states;
4. **Configuration** — family `3400`/`3402`, base unit and current pack size.

Every view supports label search, task-relevant family and completion filters,
and bounded pages of 25 products. Client state retains edits across views and
pages. Moving forward with the primary workflow action persists dirty drafts.

## Invariants

- Blank still means uncounted; explicit zero still means counted and absent.
- Only configured products enter the reserve, shelf and review passes.
  Unconfigured products remain discoverable in the configuration view.
- Pack size remains editable during the reserve pass because it may vary by
  order; a committed snapshot still freezes the value used by that count.
- A partial line cannot be committed and is identified before the request.
- Save and next/commit actions stay reachable from the first viewport on mobile
  and desktop.
- Pagination is presentational: the full store-scoped draft is serialized and
  validated exactly as before, including edits made on non-visible pages.
- Pure inventory calculations remain outside React.

## Acceptance criteria

- no inventory view renders more than 25 product cards at once;
- the default operational view excludes unconfigured reference products without
  hiding or deleting them;
- reserve, shelf and review progress is visible independently;
- a user can configure one product, count reserve, count shelf, save, reload and
  commit the same versioned observation;
- save and workflow actions are visible without traversing the product list;
- search, family, completion and stockout filters reset pagination safely;
- mobile and desktop Playwright acceptance cover the bounded list and complete
  workflow;
- store authorization and API contracts remain unchanged.

## Follow-up boundaries

The same audit identified separate work for the product matrix, order review,
high-cardinality product selectors and historical lists. Those concerns remain
future `UX-LIST-*` tickets and are not folded into this inventory change.
