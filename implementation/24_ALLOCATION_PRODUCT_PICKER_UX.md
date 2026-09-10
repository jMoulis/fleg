# UX-LIST-04 — searchable allocation product selectors

## Observed problem

The allocation workspace loaded the full store catalog into two product
selectboxes: one for product constraints and one for manual shelf allocation.
With hundreds of products, the manager had to scan a long unbounded menu. A
second catalog list silently stopped after 100 entries and selecting a row did
not itself add the product, which made the action difficult to understand.

## Decision

Keep the existing PREV3-03 domain and API contracts unchanged. Replace both
high-cardinality selectboxes with explicit searchable, locally paginated lists:

- the constraint editor searches the complete authorized catalog, renders at
  most 10 candidates and identifies the selected and already configured items;
- the shelf editor searches only products that are compatible with the selected
  fixture and not already allocated to the selected shelf;
- each shelf result exposes its available economics and can be added directly;
- changing the search or selected shelf returns the corresponding result list
  to page 1;
- result ranges and previous/next controls remain accessible on mobile and
  desktop.

The former silent 100-item catalog cap is removed. No product is hidden behind
an undocumented cutoff.

## Invariants

- Product data remains the store-scoped server result supplied to the client;
  search and pagination grant no authorization.
- Compatibility, must-stock, minimum facing and shelf-capacity calculations
  remain in the existing domain services.
- Adding a result still creates a manager draft line only. It never modifies
  the physical layout or publishes an allocation.
- Constraint and allocation mutations retain their existing Zod validation,
  permissions, idempotency, versioning and audit behavior.
- Missing revenue, margin, forecast or markdown evidence remains missing and is
  not replaced by zero.

## Acceptance

- neither product selector renders more than 10 candidates at once;
- text search is applied before pagination and a new search starts on page 1;
- every authorized catalog product remains reachable in the constraint editor;
- only compatible, not-yet-allocated products appear in the shelf picker;
- a product can be configured, added to a shelf, and saved through the existing
  browser acceptance flow;
- quality, production build and full Playwright suites remain green.

## Follow-up boundary

Other high-cardinality selectors in TG, experiments, markdown and contextual
observations remain separate `UX-LIST-*` work. This ticket does not redesign
those workflows or introduce a remote autocomplete API.
