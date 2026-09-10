# UX-LIST-02 — scalable product matrix

## Observed problem

The product matrix can contain several hundred articles. Rendering every mobile
card and every desktop row in one response makes the page unnecessarily long
and duplicates the complete reference in the responsive DOM.

## Decision

Keep the existing server-side analytics, recommendation and true-XYZ
calculations, then apply the current search, filters and sort before presenting
bounded pages of 25 products.

Pagination is encoded in the `page` URL parameter. Previous and next links
preserve the selected period, search, ABC/XYZ filters and sort. Submitting the
filter form deliberately omits `page`, returning the user to the first page of
the new result set. An out-of-range but valid page is clamped to the last
available page.

## Interaction contract

- the total number of filtered products remains visible;
- the visible result interval and current page are shown before and after the
  list;
- previous and next controls are keyboard-accessible links with distinct
  navigation landmark labels;
- mobile keeps product cards and desktop keeps the analytical table;
- neither responsive representation renders more than 25 products;
- product drill-down keeps the selected analytical period;
- empty-filter and no-import states keep their existing semantics.

## Data and authorization boundaries

This ticket does not change metric formulas, recommendation decisions, MongoDB
repositories or store authorization. All reads still use the authenticated
`requireStoreContext` and its authorized `storeId`. Database-level pagination
can follow only if pilot measurements show that the analytical calculation,
rather than DOM size, is the remaining bottleneck.

## Acceptance

- the `page` query is validated as an integer from 1 to 10,000;
- filtering and sorting happen before slicing;
- first and last page navigation states are explicit;
- Playwright verifies 25 visible products, preserved query context and
  navigation to page 2 on mobile and desktop;
- lint, strict typecheck, unused-code audit, unit/integration tests, production
  build and the browser suite remain green.
