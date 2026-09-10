# UX-LIST-06 — scalable TG product selection and cancelled history

## Observed problem

The TG editor loaded the complete store catalog into a selectbox before a
separate add action. This repeats the high-cardinality pattern removed from the
allocation and markdown workflows. The collapsed cancelled-operation section
also rendered every cancelled event in the DOM, up to the existing 500-event
workspace boundary.

## Decision

Keep TG-01 domain and API contracts unchanged while bounding both interactions:

- reuse the searchable product picker with at most 10 available candidates per
  page;
- add a product directly from its result row and exclude already selected
  products from subsequent results;
- keep selected products explicit and individually removable;
- order cancelled operations by latest cancellation and render at most 25 per
  local page inside the existing collapsed section;
- expose accessible result ranges and previous/next controls.

The weekly calendar does not need artificial pagination. It already selects one
week at a time, and the server rejects overlapping non-cancelled operations for
the same authorized endcap. Pagination there would hide relevant schedule
conflicts rather than improve the task.

## Invariants

- An operation still requires at least one and accepts at most 50 products.
- Draft, publication, completion and cancellation transitions remain unchanged.
- The same store-scoped product and endcap references are validated by the
  server; client search grants no access.
- Dates, objectives, realized results, overlap protection, idempotency and audit
  semantics remain unchanged.
- Photo attachments remain manual observations and are not modified by this
  ticket.

## Acceptance

- no TG product picker renders more than 10 candidates;
- search is applied before pagination and a selected product disappears from
  the available candidates;
- no cancelled-operation view renders more than 25 entries;
- a manager can add a searched product, publish and complete an operation, then
  create and cancel a draft through the responsive browser flow;
- quality, production build and full Playwright suites remain green.

## Follow-up boundary

Experiment and contextual-observation product selectors remain later
`UX-LIST-*` tickets. Attachment target selectors are a shared cross-feature
concern and are not changed inside the TG lifecycle PR.
