# Coding agent execution protocol

## Before coding
1. Read `AGENTS.md`.
2. Read this implementation folder.
3. Read domain spec relevant to current ticket.
4. Inspect Figma reference for the relevant screen.
5. Verify current APIs for dependencies being used.

## Per ticket
- state assumptions
- implement smallest coherent change
- add/update Zod schema
- add authorization check
- add unit/integration tests
- run typecheck/lint/tests
- capture screenshot for UI tickets at mobile and desktop widths
- report schema/index changes
- report unresolved limitations

## Forbidden shortcuts
- no direct Mongo calls from React components
- no client-only store authorization
- no hidden magic weights in recommendations
- no overwriting observed facts with derived data
- no AI direct mutations
- no desktop grid squeezed into mobile
- no hard-coded reference-store geometry in generic engine; seed it as configurable data

## Commit grouping
Prefer one coherent ticket per commit. Database migrations/index additions should be explicit and documented.
