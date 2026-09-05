# F&L Cockpit — Product & Technical Specification

**Version:** 1.1 — 2026-09-01  
**Purpose:** autonomous coding-agent handoff.

## Vision
A production-grade, multi-point-of-sale application for supermarket Fruit & Vegetable departments. It transforms Mercalys sales/margin exports, markdown data, store geometry, merchandising allocation, commercial events and manager knowledge into operational decisions.

## Mandatory stack
- Next.js 16+ App Router
- React + strict TypeScript
- MongoDB Atlas + official Node.js driver
- Better Auth + MongoDB adapter + Organization plugin
- AI SDK
- Tailwind CSS
- shadcn/ui
- Zod
- pnpm
- Recharts recommended for dashboards
- AG Grid Community recommended for dense analytical tables

Before implementation, verify the current stable versions and migration notes for every dependency. Do not downgrade merely to match this document.

## Tenancy
```text
Organization / Group
 ├─ Store A
 │   └─ F&L Department
 ├─ Store B
 │   └─ F&L Department
 └─ Store N
```
A user authenticates once, belongs to an organization and may have access to one or several stores, with a different role per store.

## Core product loop
**Import → Understand → Forecast → Decide → Allocate → Execute → Measure → Learn**

## Primary optimization target
Maximize **post-markdown gross margin per scarce effective display capacity**, while protecting traffic products, availability, assortment quality and operational simplicity.

## Start here
1. `AGENTS.md`
2. `docs/00_TENANCY_AUTH.md`
3. `docs/01_PRD.md`
4. `docs/04_ARCHITECTURE.md`
5. `docs/05_DATA_MODEL.md`
6. `docs/14_BUILD_PLAN.md`
7. `docs/18_OPERATIONS.md`


## Implementation Blueprint
For coding-agent execution, start with `implementation/START_HERE_FOR_AGENT.md` and `implementation/00_IMPLEMENTATION_BLUEPRINT.md`.


## v1.3 addition — Experiment Engine
The specification now includes a full Tests & Experiments module for defining commercial tests (e.g. Banane vrac in TG1), freezing the hypothesis/treatment/baseline/KPIs, evaluating actual vs expected results, calculating uplift and incremental economics, explaining evidence quality, and recording rollout/retest decisions. Read `docs/17_EXPERIMENT_ENGINE.md`, `implementation/11_EXPERIMENT_ENGINE.md` and `mockups/06_TESTS_EXPERIMENTS.md`.
