# HARD-02 — code hygiene audit

## Scope and guardrail

This audit is behavior-preserving. It does not change business calculations,
HTTP routes, persisted schemas, authorization rules or user-visible workflows.
An item is removed only when TypeScript and the repository-wide reachability
graph both show that it has no consumer.

## Permanent gates

- TypeScript checks `noUnusedLocals` and `noUnusedParameters`.
- `npm run audit:unused` runs Knip with its Next.js, Vitest and Playwright
  integrations enabled from the installed dependencies.
- `npm run check` includes lint, strict type checking, the unused-code audit and
  the unit/integration suite.
- `ignoreExportsUsedInFile` keeps an exported building block when it is also
  consumed inside its own module. No file or named-symbol exception is used.

## Reviewed removals

### Unreachable files

- `schemas/domain.ts`: legacy monolithic domain draft, superseded by the active
  schemas under `src/domain/` and never imported;
- `src/server/db/indexes.ts`: obsolete wrapper superseded by
  `foundation-indexes.ts`, which is called from the live MongoDB connection and
  seed paths;
- `src/components/ui/separator.tsx`: became unreachable after the unused field
  separator variant was removed.

### Unused surfaces in reachable files

- 11 unused UI variants from the alert, card, field and select primitives;
- 4 unused server helper functions;
- 4 response or snapshot schemas that never validated an input or output;
- 33 exported type aliases with no compile-time consumer;
- 1 unused re-export from the server invitation-email boundary;
- 2 unused MongoDB constructor properties, while preserving the constructor
  parameters used to initialize collections.

The executable schema values referenced by other schemas remain in place even
when their inferred type alias was unused.

## Dependency correction

`server-only` is imported directly throughout the server layer and is now a
direct production dependency. Previously it was available only transitively,
which made clean installs dependent on another package's internal dependency
tree. Knip is a development dependency.

## Intentionally retained entry points

The following files are reachable through framework or command conventions and
must not be removed merely because application imports do not reference them:

- Next.js App Router files under `src/app/`, including `page`, `layout`,
  `route`, `loading`, `error` and `global-error`;
- Next.js and PostCSS configuration files;
- Vitest tests and Playwright configuration, setup, helpers and specifications;
- command entry points under `src/scripts/` referenced by `package.json`;
- exports used within their defining module, including composed UI primitives.

These are discovered by Knip's framework integrations rather than broad manual
ignore patterns.

## Review commands

```bash
npm run audit:unused
npm run check
npm run build
npm run test:e2e
```

The audit is complete only when all four commands pass and `git diff --check`
reports no whitespace error.

## Verification result

Verified on 2026-09-10:

- unused-code audit: no finding;
- lint and strict type checking: passed;
- unit/integration suite: 74 files and 277 tests passed;
- production build and E2E build: passed;
- browser acceptance: 30 tests passed on mobile and desktop, with the 4 live
  OpenAI tests intentionally skipped by the default suite;
- whitespace validation: passed.
