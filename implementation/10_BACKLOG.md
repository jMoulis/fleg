# Build backlog — recommended order

| ID | Epic | Ticket | Priority | Depends on |
|---|---|---|---|---|
| FND-01 | Foundation | Scaffold Next.js, strict TS, Tailwind, shadcn | P0 | — |
| FND-02 | Foundation | Mongo client, env validation, health check | P0 | FND-01 |
| AUTH-01 | Auth | Better Auth + Mongo adapter + Organization plugin | P0 | FND-02 |
| AUTH-02 | Auth | Stores/storeMemberships + `requireStoreContext` | P0 | AUTH-01 |
| AUTH-03 | Auth | Store switcher + isolation tests | P0 | AUTH-02 |
| ADM-01 | Administration | Organization/store onboarding, invitations, roles and explicit store permissions | P1 | AUTH-03 |
| IMP-01 | Import | Upload + parser + Mercalys column mapping | P0 | AUTH-03 |
| IMP-02 | Import | Aggregate-row detector + preview reconciliation | P0 | IMP-01 |
| IMP-03 | Import | Product/alias resolution queue | P0 | IMP-02 |
| IMP-04 | Import | Idempotent commit + data revision | P0 | IMP-03 |
| ANA-01 | Analytics | Dashboard KPI service | P0 | IMP-04 |
| ANA-02 | Analytics | Product metrics + ABC/Pareto | P0 | IMP-04 |
| ANA-03 | Analytics | Seasonality/forecast + confidence | P0 | ANA-02 |
| REC-01 | Recommendations | Evidence-based recommendation engine | P0 | ANA-03 |
| UX-01 | UX | Mobile dashboard/actions shell | P0 | ANA-01 |
| UX-02 | UX | Desktop dashboard | P0 | ANA-01 |
| UX-03 | UX | Mobile product list/detail | P0 | ANA-02, REC-01 |
| UX-04 | UX | Desktop product matrix | P0 | ANA-02, REC-01 |
| DEC-01 | Decisions | Accept/modify/reject/defer + audit | P0 | REC-01 |
| E2E-01 | Quality | Full vertical-slice Playwright flow | P0 | DEC-01 |
| SPC-01 | Space | Layout version model + reference-store seed | P1 | E2E-01 |
| SPC-02 | Space | Mobile interactive plan | P1 | SPC-01 |
| SPC-03 | Space | Desktop allocation planner | P1 | SPC-01 |
| TG-01 | TG | Commercial-event/TG planner | P1 | E2E-01 |
| EXP-01 | Experiments | Experiment model, permissions and lifecycle | P1 | E2E-01 |
| EXP-02 | Experiments | Create/run mobile experiment flow | P1 | EXP-01, TG-01 |
| EXP-03 | Experiments | Comparable-period baseline service | P1 | EXP-01, ANA-03 |
| EXP-04 | Experiments | Uplift/economics evaluation + evidence quality | P1 | EXP-03, MD-01 |
| EXP-05 | Experiments | Desktop analysis + manager conclusion | P1 | EXP-04, DEC-01 |
| EXP-06 | Experiments | Control-store / diff-in-diff evaluation | P2 | EXP-05, NET-01 |
| MD-01 | Markdown | Markdown capture + post-markdown economics | P1 | E2E-01 |
| NET-01 | Network | Cross-store dashboard with explicit permission | P1 | AUTH-03, ANA-01 |
| AI-01 | AI | Typed read-only store tools | P1 | ANA-03 |
| AI-02 | AI | Copilot UI + evidence | P1 | AI-01 |
| AI-03 | AI | Draft action plans + approval boundary | P2 | AI-02, DEC-01 |
| HARD-01 | Hardening | Accessibility, perf, indexes, monitoring | P1 | ongoing |
| PREV3-01 | Configuration | Store targets + configurable business coefficients | P1 | ADM-01, ANA-01 |
| PREV3-02 | Decisions | Realized outcomes + before/after follow-up | P1 | PREV3-01, DEC-01 |
| PREV3-03 | Space | Must-stock, suitability + markdown-aware constraints | P1 | PREV3-01, SPC-03, MD-01 |
| PREV3-04 | Media | Manual store/layout/fixture/event photo attachments | P2 | SPC-01, TG-01 |
| V3-01 | Granular data | Daily sales ingestion + deterministic weekly views | P0 | PREV3-04, IMP-04 |
| V3-02 | Inventory | Store-scoped stock snapshots + availability evidence | P0 | V3-01 |
| V3-03 | Analytics | True XYZ from complete granular demand windows | P1 | V3-01, PREV3-01 |
| V3-04 | Forecasting | Day-of-week forecast + confidence evidence | P1 | V3-01, V3-03 |
| V3-05 | Context | Promotion and weather observations/features | P2 | V3-04 |
| V3-06 | Ordering | Evidence-backed order suggestion drafts | P1 | V3-02, V3-04 |
| HARD-02 | Hardening | Dead-code audit and repository hygiene | P1 | V3-06 |
| DOC-01 | Documentation | Documentation hub and French user guide | P1 | HARD-02 |
| UX-LIST-01 | UX | Scalable reserve/shelf inventory workflow | P0 | DOC-01, V3-02 |
| UX-LIST-02 | UX | Scalable paginated product matrix | P0 | UX-LIST-01, UX-03, UX-04 |
| UX-LIST-03 | UX | Scalable filtered order-review workflow | P0 | UX-LIST-02, V3-06 |
| UX-LIST-04 | UX | Searchable bounded allocation product selectors | P0 | UX-LIST-03, PREV3-03 |
| UX-LIST-05 | UX | Scalable markdown capture and history | P0 | UX-LIST-04, MD-01 |
| UX-LIST-06 | UX | Scalable TG product selection and cancelled history | P0 | UX-LIST-05, TG-01 |
| UX-LIST-07 | UX | Scalable experiment selectors and history | P0 | UX-LIST-06, EXP-02 |
| UX-LIST-08 | UX | Scalable context product selection and evidence histories | P0 | UX-LIST-07, V3-05 |
| UX-LIST-09 | UX | Searchable bounded photo target selection | P0 | UX-LIST-08, PREV3-04 |
| PILOT-01 | Product validation | Instrumented single-store operational pilot | P0 | UX-LIST-09, Mercalys access |
| V4-01 | Commercial intelligence | Weekly commercial brief PDF/image import | P1 | PILOT-01, representative original PDF |

## Pre-V3 gate acceptance

### PREV3-01

- authorized managers can maintain monthly store revenue targets without direct database access;
- store-configurable analytics, recommendation, experiment and space coefficients have strict Zod contracts, documented defaults and bounded values;
- reads and writes derive store scope from the authenticated server context and require `settings.write` or `targets.write` as appropriate;
- mutations use optimistic concurrency or idempotency and append an audit record;
- dashboard and network target coverage consume the same versioned target source;
- responsive loading, empty, success and error states are covered by tests.

### PREV3-02

- a manager can schedule and record a realized result for an accepted or modified recommendation;
- follow-up preserves the original recommendation snapshot and separates observed results from interpretation;
- before/after periods, inputs, revisions and limitations remain inspectable;
- outcome writes are permissioned, idempotent and audited.

### PREV3-03

- product must-stock and fixture-suitability constraints are explicit store data, never inferred from React state;
- allocation proposals preserve locked and must-stock lines and reject incompatible fixtures;
- available markdown evidence contributes to expected post-markdown economics without inventing missing loss data;
- every coefficient and limitation is visible and versioned with the allocation draft.

### PREV3-04

- managers can attach and remove manual photos from authorized stores, layouts, fixtures and commercial events;
- metadata and object access are store-scoped, validated and audited;
- supported type, size, retention and deletion behavior are explicit;
- photos never modify layout geometry automatically.

## V3 acceptance

### V3-01

- daily sales facts are additive, append-versioned and store-scoped;
- source business dates produce deterministic month and ISO week-year keys;
- preview exposes coverage, missing dates, aggregate exclusions, aliases and reconciled totals;
- commit is transactional and idempotent, versions corrections and increments the store revision once only when facts change;
- weekly reads aggregate active daily facts and never zero-fill missing days;
- monthly and daily observations are reconciled but never summed or silently substituted;
- existing monthly dashboards and recommendations remain unchanged in this ticket;
- responsive import and coverage states plus unit, isolation and E2E tests are delivered.

### V3-02

- stock snapshots are append-only observed facts with source and observation age;
- on-hand, on-order and reserved quantities remain distinct and missing values stay null;
- negative source values are exposed as anomalies rather than silently clamped;
- stockout and availability evidence is store-scoped and never backfilled.
- the first source is a persistent manual morning count: reserve cases plus shelf remainder;
- article family (`3400`/`3402`), base unit and last-known pack size are manual profile data;
- the pack size used by a committed count is frozen in its snapshot because it may change per order;
- blank quantities remain uncounted while explicit zero records a stockout;
- committed counts are immutable and corrections create a new version.

### V3-03

- true XYZ uses weekly unit demand from complete granular windows;
- CV method, window, minimum evidence, small-mean guard and thresholds are configurable and versioned;
- insufficient or invalid demand stays unclassified with warnings;
- the monthly stability proxy remains visibly distinct.

### V3-04

- day-of-week forecasts freeze their training window, data revision, model version and coefficients;
- backtests expose error metrics and confidence before recommendations consume the forecast;
- missing or partial daily coverage lowers confidence rather than becoming zero demand.

### V3-05

- promotion and weather are separate observed sources with provenance and bounded schemas;
- feature joins are date/store scoped and missing context is explicit;
- contextual features cannot rewrite sales, stock or experiment facts.

### V3-06

- order suggestions separate forecast demand, available stock, safety stock, lead time and pack constraints;
- inputs, coefficients, evidence, confidence and limitations are persisted;
- suggestions remain drafts until explicit authorized approval;
- no supplier order or external integration is executed automatically.
- the F&L default targets zero closing stock, Friday covers Saturday plus Sunday,
  Saturday orders Monday delivery and Sunday has no order run;
- the exact morning snapshot supplies on-hand and pack evidence, while the
  current-day arrival remains an explicit excluded assumption.

## Post-V3 consolidation and pilot gate

### HARD-02

- TypeScript rejects unused locals and parameters in application code;
- files, exports and dependencies are checked with a Next.js-aware reachability audit;
- only code proven unreachable is removed, with no intentional API, schema or business-behavior change;
- the complete lint, strict typecheck, unit/integration, production-build and browser suites remain green;
- cleanup findings and intentionally retained framework entry points are recorded for review.

### DOC-01

- `docs/README.md` routes readers to user, product, engineering and operations documentation;
- a French `docs/user/` guide covers onboarding, imports, product evidence, the morning stock/order ritual, space, TG, markdown, experiments, decisions, Copilot and administration;
- user terminology, permissions, confidence, missing-data states and non-automatic actions are explained consistently;
- stack, commands, navigation and feature status match the delivered application rather than the initial recommendations;
- screenshots are added only when representative pilot data is available and are not required for the first textual guide.

### UX-LIST-01

- inventory follows separate reserve, shelf and review passes, with article configuration still reachable;
- no view renders more than 25 product cards at once and edits survive filters, steps and pages;
- save and next/commit actions remain reachable without traversing the full list;
- blank versus explicit zero, variable pack size, versioning and authorization semantics remain unchanged;
- mobile and desktop acceptance cover a complete persisted inventory workflow.

### UX-LIST-02

- product search, ABC/XYZ filters and sort are applied before pagination;
- mobile cards and the desktop table render at most 25 products per page;
- the URL-backed page navigation preserves the selected analytical context;
- filtering returns to page 1 and an out-of-range valid page is clamped safely;
- visible result ranges and accessible controls are available above and below
  the list;
- metric, recommendation, authorization and product-detail semantics remain
  unchanged.

### UX-LIST-03

- order review defaults to calculated lines while every unavailable line
  remains explicitly reachable;
- search, status and family filters are applied before pages of 25 cards;
- case-count overrides, per-line reasons and the general note survive filters
  and pages;
- the persistent approval action reports incomplete entries and never bypasses
  the existing client/server validation;
- A-for-B calculation, store scope, audit and supplier non-execution semantics
  remain unchanged;
- mobile and desktop acceptance cover pagination and retained edits on a
  suggestion with more than 25 lines.

### UX-LIST-04

- allocation and product-constraint selectors search before pagination;
- neither selector renders more than 10 candidate products at once;
- allocation candidates are limited to products compatible with and absent
  from the selected shelf;
- a product can be added directly from its result row and the result disappears
  once allocated;
- configured-product, capacity, economics, authorization and persistence
  semantics remain unchanged;
- responsive browser acceptance covers policy selection and direct allocation.

### UX-LIST-05

- markdown product selection searches before pages of 10 candidates;
- the selected product remains explicit and can be changed before submission;
- history search and reason filters apply before pages of 25 facts;
- the complete loaded history still supplies the summary while each list view
  remains bounded;
- observed-fact, missing-quantity, authorization, audit and data-revision
  semantics remain unchanged;
- responsive browser acceptance covers selection, capture and history search.

### UX-LIST-06

- TG product search runs before pages of 10 available candidates;
- selecting a result adds it directly and removes it from the available list;
- cancelled operations are ordered by latest cancellation and paginated by 25;
- the active calendar stays week-scoped and naturally bounded by authorized
  endcaps and overlap constraints;
- event lifecycle, product limits, authorization, audit and attachment semantics
  remain unchanged;
- responsive browser acceptance covers product addition and cancelled history.

### UX-LIST-07

- experiment search applies within the active lifecycle category before pages
  of 25 cards;
- linked-operation and tested-product search apply before pages of 10 options;
- selecting a product adds it directly and removes it from available results;
- the optional linked operation remains explicit, replaceable and removable;
- experiment lifecycle, evaluation, authorization and audit semantics remain
  unchanged;
- responsive browser acceptance covers product selection, lifecycle completion
  and list search.

### UX-LIST-08

- promotion product search runs before pages of 10 available candidates;
- selecting a product adds it directly, removes it from candidates and keeps it
  individually removable;
- promotion and weather histories are independently paginated by 25 while the
  daily coverage remains date-range bounded;
- observed-fact, missing-context, provenance, authorization, audit and data
  revision semantics remain unchanged;
- responsive browser acceptance covers product selection, contextual joins and
  bounded evidence histories.

### UX-LIST-09

- the current photo target and its description remain explicit;
- target search applies to labels and descriptions before pages of 10 options;
- no photo-target picker renders more than 10 candidates at once;
- the existing 20-photo server limit keeps each selected-target gallery bounded;
- attachment validation, store authorization, audit, idempotency and permanent
  deletion semantics remain unchanged;
- responsive browser acceptance covers finding a TG operation and displaying
  its attached photo.

### PILOT-01

- execution waits for restored Mercalys access and does not fabricate production evidence;
- the pilot names one store, one accountable manager, dates and a frozen baseline;
- available historical daily exports are backfilled, targeting 8 complete weeks for true XYZ and 12 for weekday forecasting;
- daily coverage, import time, count time, suggestion availability, manager overrides, markdown and availability evidence are measured;
- order assumptions, especially morning residual stock and exclusion of the current-day arrival, are tested against observed practice;
- only observed pilot friction can reprioritize the V4 learning roadmap; supplier execution remains out of scope.

### V4-01

- original PDFs are preferred while validated image pages remain a visibly
  degraded fallback;
- the store-scoped source is fingerprinted, versioned and idempotent, with raw
  files kept out of Git, public documentation and application logs;
- typed extraction separates section kind, source action label, product
  identifiers, commercial values, sale dates, delivery dates, order deadline
  and anticipation week;
- every extracted field keeps page-level provenance, raw text, extraction
  version, confidence and review state;
- PLU, EAN and Gencod aliases are resolved before normalized labels, without
  silently creating or merging canonical products;
- confirmation validates transcription only; adoption and every downstream TG,
  promotion, space or order draft remain explicit, separately authorized and
  audited;
- document instructions are treated as untrusted source evidence and no import
  can publish, execute, modify a forecast or contact a supplier;
- confidential provider processing follows an explicit deployment policy with
  provider-side response storage disabled;
- automated tests use sanitized fixtures and cover ambiguity, idempotency,
  adversarial store isolation and the responsive review workflow.
