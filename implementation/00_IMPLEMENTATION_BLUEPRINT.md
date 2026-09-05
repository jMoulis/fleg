# Implementation Blueprint v1

## Purpose
This folder converts the product/design specifications into an executable build contract for a coding agent.

## Delivery strategy
Build one vertical slice end-to-end before expanding modules:

`sign-in -> authorized store selection -> Mercalys import preview -> commit -> dashboard -> product matrix -> product detail -> recommendation -> manager decision log`

This slice proves tenancy, permissions, data ingestion, analytics, UX, auditability and deployment.

## Non-negotiable invariants
- Multi-store from first commit.
- Better Auth Organization = company/network, never a point of sale.
- `stores` and `storeMemberships` are application-domain concepts.
- Every business read/write is authorized server-side against `storeId` or an explicit authorized store set.
- Next.js App Router, strict TypeScript, official MongoDB driver, Zod boundaries.
- Money = integer cents. Ratios = decimal values (`0.32`, not `32`).
- Observed facts, forecasts and recommendations remain separate.
- AI may prepare drafts but never performs state-changing decisions without explicit user approval.
- All recommendation evidence and manager overrides are auditable.
- Mobile-first UX; desktop is an enhanced analytical workspace, not a separate product.

## Target stack
- Next.js 16.x App Router
- React 19
- TypeScript strict
- Tailwind CSS + shadcn/ui
- MongoDB Atlas + official Node.js driver
- Better Auth + MongoDB adapter + Organization plugin
- Zod
- Official OpenAI SDK with the Responses API for Copilot orchestration
- Charting library selected at implementation time based on accessibility, responsive behavior and bundle size
- Data-grid library selected for desktop product matrix; mobile must use purpose-built cards/list views rather than compressing a desktop grid

Exact dependency APIs and versions MUST be checked before installation.

## Build order
1. Foundation and tenancy.
2. Vertical slice data/import.
3. Analytics and recommendation engine.
4. Mobile/desktop UX hardening.
5. Space Planner.
6. TG + markdown + decision outcome loop.
7. AI Copilot.
8. Multi-store/network analytics.
9. Performance, accessibility and production hardening.

## Definition of done for every ticket
A feature is incomplete until it includes authorization, validation, loading/empty/error states, tests, auditability where relevant and responsive behavior where relevant.
