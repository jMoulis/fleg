# Build backlog — recommended order

| ID | Epic | Ticket | Priority | Depends on |
|---|---|---|---|---|
| FND-01 | Foundation | Scaffold Next.js, strict TS, Tailwind, shadcn | P0 | — |
| FND-02 | Foundation | Mongo client, env validation, health check | P0 | FND-01 |
| AUTH-01 | Auth | Better Auth + Mongo adapter + Organization plugin | P0 | FND-02 |
| AUTH-02 | Auth | Stores/storeMemberships + `requireStoreContext` | P0 | AUTH-01 |
| AUTH-03 | Auth | Store switcher + isolation tests | P0 | AUTH-02 |
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
