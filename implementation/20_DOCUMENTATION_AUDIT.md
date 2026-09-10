# DOC-01 — Documentation audit

## Objective

Provide a text-first documentation portal and French user guide that match the
delivered V3 interface before the real Mercalys pilot begins.

## Delivered files

- `docs/README.md` routes readers by audience and document status.
- `docs/user/00_START_HERE.md` through
  `docs/user/07_GLOSSARY_AND_TROUBLESHOOTING.md` cover the current user journeys.
- the authenticated store route `/help` renders those same Markdown sources,
  provides task and terminology search, and rewrites internal guide links.
- the root `README.md` now describes the delivered stack and current product
  status rather than only the original autonomous-agent handoff.

## Drift corrected

- npm and `package-lock.json` are the repository package workflow; the earlier
  pnpm statement was removed.
- the Copilot uses the official OpenAI SDK and Responses API; the historical
  AI SDK label was removed.
- the delivered product matrix and visualizations are native responsive
  HTML/CSS/SVG; AG Grid and Recharts are not presented as installed runtime
  dependencies.
- the navigation now documents Stocks, Order, Context and Tests, and explains
  that forecasts live in the product and order journeys rather than a separate
  route.
- deterministic space and order proposal buttons are explicitly distinguished
  from AI.
- the 09:30 order cutoff is documented as an informational, configurable marker
  because the current implementation does not enforce it.
- Friday covers Saturday and Sunday demand; Saturday covers Monday; Sunday has
  no order proposal in the current calendar model.
- manual product family, unit and variable pack-size configuration is included,
  with `3400` for fruit and `3402` for vegetables.

## Verification sources

The guide was reconciled against current routes, navigation definitions,
permission schemas, user-facing forms, calculation services and browser
acceptance coverage. Security statements follow `AGENTS.md`: authorization is
server-side and every business access is scoped to an authorized store.

## Intentional deferral

Representative screenshots are deferred until the single-store pilot has real
Mercalys data. This avoids turning empty states or synthetic fixtures into
misleading operational examples. The screenshot pass should follow PILOT-01
and update the guide without changing its security or data-semantics rules.
