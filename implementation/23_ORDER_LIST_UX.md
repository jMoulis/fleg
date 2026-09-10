# UX-LIST-03 — scalable order review workflow

## Observed problem

An order suggestion contains one evidence-rich card for every catalog product,
including lines that cannot be calculated. With hundreds of products, the
manager must scroll through the entire catalog before reaching the approval
action and cannot isolate the lines relevant to the morning task.

## Decision

Keep the persisted V3-06 suggestion and approval contracts unchanged. Present
the suggestion as a bounded review workspace:

- default to **Calculated** lines, meaning every line with a proposed case
  count, including zero-case decisions;
- expose separate Ready to order, No order, Unavailable, Modified and All
  filters with their counts;
- add product search and family filters (`3400`, `3402`, unknown);
- render at most 25 evidence cards per page;
- preserve every case-count override, reason and general note while filters and
  pages change;
- keep the audited manager approval action visible above the mobile navigation
  and below the desktop application header.

Unavailable lines remain explicit and inspectable. They are not converted into
zero orders and are never included in the approval payload.

## Validation behavior

The fixed action summary reports calculated and modified line counts. Approval
is disabled while a case count is empty or invalid, or while a changed line has
no reason of at least three characters. The existing Zod boundary and
server-side approval checks remain the authority.

Changing a filter resets only the visible page, not the draft. Changing pages
returns focus context to the beginning of the line-review section. Recalculating
a suggestion resets the local review filters because the persisted evidence has
changed.

## Data and authorization boundaries

This ticket does not change the A-for-B calendar, forecasts, stock evidence,
pack rounding, recommendation permission, audit trail or non-execution
guarantee. The complete suggestion remains store-scoped and server-generated;
filtering and pagination only control its client-side presentation.

## Acceptance

- no filtered view renders more than 25 suggestion cards;
- status, family and text filters expose every persisted line;
- edits survive filter and page changes and are all included at approval;
- validation remains reachable without traversing the product list;
- invalid counts and missing override reasons block the action visibly;
- responsive Playwright acceptance proves pagination and retained edits with a
  suggestion containing more than 25 lines;
- quality, production build and full browser suites remain green.
