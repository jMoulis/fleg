# Build backlog — recommended order

## Correctif prioritaire stockage — 2026-09-11

`HARD-STORAGE-01` : isolation des E2E locaux, preuves de commande compactes,
cache de recommandations borné et nettoyage sauvegardé des fixtures.
PR #29 mergée et déployée ; ses protections sont intégrées à la branche TECH-01.
Contrat et procédure : [conservation MongoDB](../docs/23_STORAGE_RETENTION.md).
Ce correctif ne change pas les gates PILOT/TECH/V4 ; TECH-01 reste dans sa PR
indépendante. La migration des anciennes recommandations attend le retrait
des anciens writers et un inventaire des références historiques.

## Current planning baseline — 2026-09-12

**Latest TECH-04 update (supersedes the historical dev gate below):** the manager
explicitly authorized usable uploads and bounded real Blob dev tests. PR #41 adds
the connected Documents/PDF journey, owner-only post-PUT verification, recovery
after reload, private download and source removal. Local uploads are enabled with
explicit 100 MiB / 20-object ceilings. Production stays locked; the photo queue,
migration, provider lifetime/quota-release proof and deployed acceptance remain
open. The `x-content-type` dev probe passed all 14 checks; a separate real browser
test verified interrupted-upload recovery and identical downloaded bytes.
See the [current delivery record](./38_TECH_04_PRIVATE_OBJECT_STORAGE.md).
No change of roadmap, no extraction/embeddings and no PILOT-01 closure.

V1/V2/V3 and the post-V3 list/documentation sequence are delivered;
`PILOT-01` still awaits real field evidence. The reported cold-room connectivity
problem prioritized `TECH-01` (merged/deployed) and `TECH-02` (merged via #30).
`TECH-03` synchronization is merged via #31; physical-device cold-room
evidence still bounds rollout claims. The manager reported testing the unified
journey on 2026-09-12 and explicitly requested resuming the PR #26 roadmap.
Device/browser and scenario outcomes are requested, not assumed complete.
Other `TECH-*`, `V4-*` and `V5-*` entries remain undelivered.
See [TECH-01 evidence](./33_TECH_01_OFFLINE_WORKSPACE.md)
and [TECH-03 boundaries and evidence](./35_TECH_03_INVENTORY_SYNCHRONIZATION.md).

Merged via PR #32, `UX-STOCK-01`: coherent connected/offline stock presentation,
compact field counting and progressive disclosure, without generalized offline
navigation or new synchronization semantics. See [the UX contract](./36_UX_STOCK_OFFLINE_WORKFLOW.md).

`UX-STOCK-02` — one morning count regardless of connectivity — and its framing
are merged via PR #34/#33, with green quality/build and E2E checks.
The [contract and delivery record](./37_UNIFIED_MORNING_INVENTORY.md)
describe the single editor and its lifecycle. Preserve all existing
drafts and versioned stock. The reported test does not close `PILOT-01` or
prove unreported device/isolation scenarios.

**Next ticket: `TECH-04` — private Blob objects and recoverable uploads.**
The [execution contract](./38_TECH_04_PRIVATE_OBJECT_STORAGE.md) now records two
private Paris Blob stores, configured after explicit approval: Development/Preview
separate from Production. The local Blob configuration points to development;
the original store remains intact and disconnected. Lot 1 now implements
disabled-by-default metadata intents, atomic quotas and hybrid private reads;
the existing BSON photo workflow remains available. Lot 2a adds persisted bounded
authorizations, a presigned transport adapter, signed callback recording and
cancellation, all behind a non-configurable transport release gate (PR #37 merged).
Lot 2b (PR #38 merged) implements bounded byte/PDF validation, current-author reauthorization,
transactional linking, private source APIs and durable scoped maintenance/deletion.
Read its runbook in the contract. **Continue the TECH-04 lot 2 release gates**:
provider evidence, budget and explicitly authorized non-production acceptance.
Presigned `put` also covers multipart: provider lifetime/cleanup evidence is
required before releasing quotas or opening the transport.
No Blob upload is available yet; local photo queuing and migration follow.
Usage budget and upload/security acceptance remain open. The subsequent
order remains TECH-05, then V4-01 after its own gates, then TECH-06; do not skip
from storage directly to vectorization or coaching.
An isolated dev-storage operator probe is merged via PR #39 (`npm run verify:storage`,
dry-run by default); its runbook separates provider checks from local parser
proof and deployed-function/callback acceptance. The explicitly authorized live
recipe on 2026-09-12 failed its MIME refusal check (HTTP 200): 68 payload bytes,
11 reserved operations, exact-path cleanup with fresh absence observed on all
three paths. The PDF and subsequent checks did not run. Clarify the wire-level
MIME contract before a new recipe; see evidence in the contract. No production
toggle changed, no application upload opened, no provider vulnerability inferred.
PR #40 is also merged. Branch `codex/tech-04-mime-probe-evidence` prepares report
v2 with an explicit single MIME-header variant, sanitized HTTP/metadata evidence
before cleanup and real SDK wire tests with network blocked. Nominal budget is
27 operations (six extra metadata GETs), same 3 paths / 30 MiB / 100-operation
ceilings. v1 remains cleanup-only with its history/counters retained. This does
not prove provider enforcement or authorize a second live run; see the v2
runbook and obtain explicit bounded approval before execution. TECH-04 stays open.

Follow [the technical sequence](./31_OFFLINE_AND_DOCUMENT_FOUNDATION.md) and
[the coach delivery gates](./32_OPERATIONAL_COACH_ROADMAP.md). Preserve existing
ids: `V4-01` remains the commercial brief, while `V4-06` extends the already
delivered `V3-06` ordering engine. A ticket's priority does not waive dependencies
or evidence gates. Technical recovery and sanitized fixture work can proceed
before the pilot; commercial calibration cannot.

`backlog.machine.json` is a selective machine-readable mirror, not a replacement
for this complete historical table. New planned entries include `dependsOn`,
`externalGates` and `spec`; gates are not claims of completion.

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
| TECH-01 | Offline | Installable PWA and prepared field workspace | P0 | AUTH-02, UX-LIST-01 |
| TECH-02 | Offline | Persistent local inventory drafts | P0 | TECH-01, V3-02 |
| TECH-03 | Offline | Reliable synchronization and cold-room acceptance | P0 | TECH-02, target-device validation |
| TECH-04 | Documents | Private Blob objects and recoverable uploads | P1 | PREV3-04, TECH-03 |
| TECH-05 | Documents | Durable document-processing jobs | P1 | TECH-04 |
| TECH-06 | Documents | Cited and scoped document retrieval | P1 | TECH-05, V4-01, AI-01 |
| V4-01 | Commercial intelligence | Weekly commercial brief PDF/image import | P1 | PILOT-01, TECH-05, representative original PDF |
| V4-02 | Context | Automatic and qualitative context journal | P1 | PILOT-01, V3-05, TECH-03, TECH-05 |
| V4-03 | Assortment | Local assortment opportunities | P2 | PILOT-01, V4-02 |
| V4-04 | Coaching | Objective-led briefing and bounded prioritization | P1 | PILOT-01, AI-03, REC-01, TECH-03 |
| V4-05 | Experiments | Guided tests and granular evaluation | P1 | V4-04, V3-01, EXP-05 |
| V4-06 | Ordering | Contextual coaching of existing order suggestions | P1 | V4-01, V4-02, V4-04, V3-06, TECH-03 |
| V4-07 | Merchandising | Constrained TG, island and allocation proposals | P1 | V4-01, V4-04, V4-05, PREV3-03 |
| V4-08 | Learning | Empirical context effects and reusable learning | P2 | V4-02, V4-05, EXP-06, PREV3-02, suitable evidence |
| V5-01 | Knowledge | Sourced primeur and merchandising knowledge | P2 | TECH-06, V4-05, reviewed corpus |
| V5-02 | Vision | Photo-assisted field observations | P2 | TECH-04, V4-05, V5-01, representative photo evals |
| V5-03 | Simulation | Visual merchandising proposals and bounded simulation | P2 | V4-07, V4-08, V5-02, measured response data |
| V5-04 | Coaching | Actionable anomaly follow-up | P2 | V4-04, V4-08, false-alert evaluation |

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
- the beta operator follows a repeatable daily checklist and supplies a weekly
  report that separates data defects, business-model assumptions, UX friction
  and missing capabilities;
- record device/browser, connectivity interruptions, unsynchronized work and
  recovery time; offline acceptance requires the delivered `TECH-03` recipe,
  and connected commercial observations can begin independently;
- only observed pilot friction can reprioritize the V4 learning roadmap; supplier execution remains out of scope.

## Technical foundation acceptance

### UX-STOCK-02 — unified morning count (merged, user test reported)

- one operational editor for start/resume, reserve, shelf, review and validation;
- network transitions change save/sync status, not the counting workflow;
- date, draft identity, previous references and committed corrections are unambiguous;
- preparation and consent-aware synchronization are integrated into the journey;
- offline editing never implies online stock commitment or supplier ordering;
- existing local data survives transition, uncertain writes and legacy clients;
- full regression and target-device acceptance precede rollout.

Detailed rules and delivery sequence: [37 — unified morning inventory](./37_UNIFIED_MORNING_INVENTORY.md).

Detailed scope, shared security rules, recovery cases and release evidence live
in [31 — Offline and document foundation](./31_OFFLINE_AND_DOCUMENT_FOUNDATION.md).

### TECH-01

- installable shell and prepared authorized catalog support offline cold launch;
- preparation completeness, scope, revision, age and storage readiness are visible;
- static assets and private domain data have separate explicit caching policies;
- safe app upgrades, local retention and target-device behavior are documented.

### TECH-02

- each inventory edit and pending operation is durably stored before local acknowledgement;
- drafts restore after reload/reopen and are isolated by account/store/date;
- incomplete inputs, blank/zero, observed time, unit and variable pack size survive;
- local completion is not server commitment and cannot supply authoritative orders.

### TECH-03

- stable idempotent operations synchronize in order with revision checks;
- lost responses, multiple tabs/devices and conflicts cannot duplicate or silently overwrite stock;
- session expiry and revoked access stop replay without exposing another user's draft;
- foreground reconnect/reopen recovery works without requiring Background Sync;
- commitment/approval stay online and real-device offline acceptance is recorded.

### TECH-04

- private Paris resources and scoped configuration are ready; see [the execution contract](./38_TECH_04_PRIVATE_OBJECT_STORAGE.md);
- implementation, usage budgets and non-production upload/security acceptance precede operational activation;
- private Blob upload/read access derives from the server-authorized store;
- intent, validation, linking, reconciliation and cleanup are idempotent;
- bounded queued field photos and interrupted uploads expose recovery states;
- existing BSON photos remain readable throughout a verified storage transition;
- retention/deletion cover source files and derived/provider artifacts.

### TECH-05

- persistent jobs checkpoint bounded extraction/indexing work independently of the browser;
- retries, cancellation, provider spend, deletion races and status are explicit;
- workers preserve store scope, source versions and untrusted-document boundaries;
- sanitized lifecycle tests do not claim representative PDF or business validation.

### TECH-06

- versioned chunks and embeddings retain confirmed source/page provenance;
- retrieval combines exact business filters with semantic search;
- authorized tenant/store prefilters and current visibility checks protect every query;
- citations, abstention, reindexing and deletion behavior have explicit evals;
- similarity is never represented as numeric correctness or statistical confidence.

## V4 acceptance

### V4-01

- implementation requires `PILOT-01`, `TECH-05` and a representative original PDF;
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

The following tickets share the full acceptance and evidence gates in
[32 — Operational coach roadmap](./32_OPERATIONAL_COACH_ROADMAP.md).

### V4-02

- automatic weather/calendar context and qualitative offline notes preserve source, time and corrections;
- forecasts, regional alerts and actual store observations remain distinct;
- missing/provider-failure states stay unknown and collection adds no hidden forecast multiplier;
- journal usefulness and maintenance time are measured.

### V4-03

- product/theme hypotheses can initiate a limited test without historical sales;
- optional public aggregate territorial sources require documented suitability and reuse checks;
- no individual ethnicity/religion inference, customer ethnic segmentation or disguised proxy profiling;
- anonymous requests and observations remain hypotheses until tested commercially.

### V4-04

- objective selection produces a configurable bounded shortlist with evidence, effort and risk;
- ranking components are deterministic, explicit and versioned; numeric gains are never invented;
- no-action, exploration and missing-source states remain useful without flooding the manager;
- penetration stays unavailable without the required aggregate transaction denominator;
- decision time and usefulness are evaluated against the pilot.

### V4-05

- AI drafts use the existing human-controlled experiment lifecycle;
- short tests require explicit granular baselines/evaluation, not monthly proxy results;
- protocol, actual execution, confounders and workload limits are recorded;
- reproducible outcomes include negative/inconclusive results and never trigger silent training.

### V4-06

- extend V3-06 with context and explanation while retaining its deterministic calendar and stock/pack semantics;
- authoritative computation consumes synchronized committed stock and checks revisions at approval;
- only validated coefficients can produce contextual quantity adjustments;
- overrides remain auditable and actual supplier ordering remains external.

### V4-07

- bounded merchandising drafts use confirmed source evidence and actual layout versions;
- capacity, must-stock, locked placements and suitability remain deterministic constraints;
- every proposal states field tasks, risks and an optional test;
- manager adoption/publication uses existing permissioned workflows.

### V4-08

- empirical associations and causal estimates expose method, confounding and uncertainty;
- suitable observations, controls and leakage-free backtests gate calibration;
- proposed coefficients preserve source experiments, exact store scope and applicability;
- shadow evaluation and audited promotion/rollback precede operational consumption.

## V5 acceptance — deferred until data and outcomes are reliable

### V5-01

- a reviewed, permitted professional/research corpus has attributable sources and applicability limits;
- external practices remain distinct from central instructions and measured local results;
- cited advice becomes a bounded experiment when transfer is unproven.

### V5-02

- permitted fixture photos produce uncertain, region-grounded presentation observations;
- hidden stock, food safety, shelf life and exact geometry are not inferred as facts;
- managers confirm observations without automatic stock/layout mutation or shopper profiling.

### V5-03

- generated views are clearly proposals anchored to validated layout constraints;
- simulations use deterministic versioned response models and explicit uncertainty;
- publication and field experiments require separate human action.

### V5-04

- evidence-backed anomalies reuse the briefing's bounded notification budget;
- coverage, false alerts, duplicate suppression and field effort are evaluated;
- uncertain causes trigger evidence gathering, not autonomous intervention.
