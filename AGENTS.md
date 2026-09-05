# AGENTS.md

## Non-negotiable invariants
1. Multi-store from the first commit.
2. Better Auth is the authentication foundation.
3. Better Auth Organization = company/group; a store is NOT an auth organization.
4. Store access is a domain authorization layer.
5. Every business query is scoped by an authorized `storeId`, or an authorized store-id set for network analytics.
6. Never trust a store slug, cookie, query parameter or React state as authorization.
7. Next.js App Router; Server Components by default.
8. Strict TypeScript. No unvalidated `any`.
9. Official MongoDB Node.js driver; no Mongoose.
10. Zod at every external boundary.
11. Money stored as integer cents; ratios as decimals.
12. Business calculations live outside React.
13. Manager overrides and state-changing AI actions are auditable.
14. AI recommendations show evidence/confidence and remain drafts until explicit approval.
15. Coefficients are configurable, never unexplained magic constants.

## Implementation principles
- Route Handlers for application APIs.
- Repository functions require tenant/store context.
- Idempotent imports.
- Canonical product + source aliases.
- Version store layouts.
- Separate observed facts from forecasts/recommendations.
- Persist recommendation inputs/model version so decisions are explainable.
- Build for monthly data now, daily/weekly facts later without schema replacement.

## Definition of done
Every feature includes:
- types + Zod schemas,
- authorization,
- loading/empty/error states,
- unit tests for calculations,
- integration tests for store isolation,
- accessibility,
- audit where relevant,
- acceptance criteria.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
