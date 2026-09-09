# V3-05 — Promotion and weather context

## Objective

Create trustworthy daily context evidence before any forecast or order model is
allowed to consume it. Promotion and weather stay separate from observed sales,
stock, experiments and every existing forecast.

## Persistence

- `promotionContextObservations`: immutable active or explicit-none records;
- `weatherContextObservations`: immutable bounded weather records;
- `contextObservationCommands`: store-scoped idempotency snapshots shared by
  both mutation routes.

Every record freezes `organizationId`, `storeId`, `departmentId`, business date,
provenance, actor and UTC recording time. A successful mutation increments
`stores.dataRevision` once and writes a request-correlated audit entry in the
same transaction.

## Promotion contract

An active observation requires 1–50 authorized products, a mechanic and a
label. The optional discount is a decimal ratio from 0 to 1. An explicit
`none` record has no products, mechanic, label or discount and must be manual.

Provenance is either `manual` or `commercial_event`. A commercial event source
must belong to the same authorized store, be published or completed, cover the
business date and contain all referenced products.

For a daily feature, the latest explicit-none record resets all earlier active
promotion evidence. Applicable active observations recorded after that reset
are aggregated. With neither a reset nor an applicable active record, context
is missing rather than inactive.

## Weather contract

Conditions use a bounded enum. Minimum and maximum temperature are nullable and
bounded from -50 to 60 °C; precipitation is nullable and bounded from 0 to 500
mm. Provenance is manual or a named provider with a source reference.

Weather records are never overwritten. The daily feature selects the most
recent record and exposes the candidate observation count.

## Read model

`GET /api/stores/:storeId/context` accepts either both `from` and `to`, or
neither, plus an optional reauthorized `productId`. The default is 14 days and
the explicit maximum is 92 days. Results contain raw observations, daily
features, missing promotion/weather dates, complete dates, data revision and
`business-context-v1`.

Coverage is:

- `unknown` when no contextual feature is observed;
- `partial` when at least one feature is observed but any source/date is missing;
- `complete` only when promotion and weather are both observed for every date.

## Authorization and UI

Reads require `analytics.read`. Mutations require the dedicated
`context.write` permission, granted by default to store and department managers.
The `/context` screen provides separate forms, read-only handling, provenance
history, explicit missing states and responsive daily coverage.

## Non-goals

- no automatic weather-provider fetch;
- no rewrite of commercial events;
- no forecast retraining or coefficient change;
- no experiment, recommendation or supplier-order mutation;
- no V3-06 suggestion in this ticket.
