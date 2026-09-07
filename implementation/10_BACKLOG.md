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
