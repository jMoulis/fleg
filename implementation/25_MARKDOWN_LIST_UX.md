# UX-LIST-05 — scalable markdown capture and history

## Observed problem

The markdown form loaded every catalog product into a single selectbox. The
history then rendered every loaded fact at once, up to the repository's
existing 1,000-fact read boundary. Both interactions degrade as real pilot data
accumulates and make a frequent observed-fact workflow unnecessarily slow.

## Decision

Keep the MD-01 storage and API contracts unchanged and bound both client-side
lists:

- replace the product selectbox with a reusable label search and pages of at
  most 10 candidates;
- collapse the picker after selection so the chosen product remains explicit
  without pushing the rest of the form below a long list;
- let the user reopen the picker and replace the choice before submission;
- search history by product label or note and filter it by markdown reason;
- paginate the filtered history in pages of at most 25 facts, with accessible
  result ranges and navigation above and below long pages;
- reset the history filters after a successful capture so the new fact is
  immediately visible.

The header total and quantity summary continue to cover the complete loaded
history, not only the current page.

## Invariants

- A markdown entry remains a manual, dated, store-scoped observed fact.
- Missing quantity remains unknown and is never converted to zero.
- Product search and history pagination are presentational and grant no access
  to another store's products or facts.
- Amount parsing, Zod validation, data-revision changes, authorization and audit
  behavior remain unchanged.
- The existing repository read boundary is unchanged; remote/cursor pagination
  can be introduced separately if observed pilot volume requires it.

## Acceptance

- no markdown product picker renders more than 10 candidates;
- no history view renders more than 25 facts;
- search occurs before pagination and changing a filter returns to page 1;
- a manager can search and select a product, record a fact, find it by its note
  and see it in the history;
- empty catalog, empty history, filtered-empty, read-only, error and success
  states remain understandable;
- quality, production build and full Playwright suites remain green.

## Follow-up boundary

High-cardinality selectors in TG, experiments and contextual observations stay
in later `UX-LIST-*` tickets. UX-LIST-05 does not change markdown analytics or
introduce bulk capture.
