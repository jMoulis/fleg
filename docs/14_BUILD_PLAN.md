# 14 — Autonomous agent build plan

## M0 — Foundation
- scaffold Next.js/TS/Tailwind/shadcn,
- Mongo client,
- Better Auth + Mongo adapter + Organization plugin,
- stores/storeMemberships,
- requireStoreContext,
- store switcher,
- auth/isolation tests.

## M1 — Shell
- app navigation,
- organization dashboard,
- store dashboard,
- targets/settings.

## M2 — Data/import
- product domain,
- sales facts,
- aliases,
- import jobs,
- Mercalys preview/commit,
- reconciliation tests.

## M3 — Analytics
- KPI service,
- forecast,
- ABC,
- stability proxy,
- recommendation engine,
- AG Grid product matrix,
- charts.

## M4 — Physical retail
- layout versions,
- fixture editor,
- seed reference layout from `schemas/reference-layout.json`,
- allocation engine,
- space economics.

## M5 — TG/markdown/decisions
- commercial event planner,
- markdown facts,
- post-markdown economics,
- decision log/outcome.

## M6 — AI
- AI SDK tools,
- store copilot,
- network copilot,
- draft action plans,
- eval suite.

## M7 — Hardening
- accessibility,
- performance,
- audit review,
- indexes,
- error monitoring,
- deployment docs.

At each milestone produce tests, screenshots, schema/index diff and unresolved limitations.
