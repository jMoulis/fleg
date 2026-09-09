# 06 — API contracts

All store routes validate session + store authorization.

## Auth
Better Auth handlers per official integration.

## Organizations and invitations
GET `/api/organizations` lists only organizations where the authenticated user is owner or admin.

POST `/api/organizations` creates a Better Auth organization and its first store from a UUID idempotency key.

POST `/api/organizations/:organizationId/invitations` is restricted to organization owners/admins and creates an organization-level invitation. It does not grant store access.

GET `/api/invitations/:invitationId` exposes a pending invitation only to its authenticated recipient.

POST `/api/invitations/:invitationId/register` creates credentials only when the opaque invitation is pending, unexpired and its recipient has no account. The recipient email comes from the invitation, never from the request body. It does not accept the invitation or grant store access.

POST `/api/invitations/:invitationId/accept` accepts the invitation for its authenticated recipient. Store access must then be assigned by an organization owner/admin.

## Stores
GET `/api/stores` lists only stores authorized for the authenticated user.

POST `/api/stores` is restricted to organization owners/admins and creates a store, its fruit-and-vegetable department and its first reference layout. The body carries `organizationId`, `code`, `name` and a UUID idempotency key.

GET/PATCH `/api/stores/:storeId` is restricted to owners/admins of the store organization. PATCH uses `basedOnUpdatedAt` for optimistic concurrency and supports rename, deactivation and reactivation.

GET `/api/stores/:storeId/members` returns the organization administration workspace for owners/admins, including all stores, Better Auth members, pending invitations and explicit store memberships.

POST `/api/stores/:storeId/members` assigns or replaces one ordinary organization member's store role, permission set and active state. Active access requires `stores.read`; the mutation is audited and idempotent.

## Imports
POST `/api/stores/:storeId/imports/preview`
POST `/api/stores/:storeId/imports/:importId/commit`
GET `/api/stores/:storeId/imports`

POST `/api/stores/:storeId/imports/daily/preview`

POST `/api/stores/:storeId/imports/daily/:importId/commit`

## Analytics
GET `/api/stores/:storeId/dashboard?period=YYYY-MM`
GET `/api/stores/:storeId/products/metrics?period=YYYY-MM`
GET `/api/network/dashboard?storeIds=...&period=YYYY-MM`

GET `/api/stores/:storeId/sales/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&productId=...`

GET `/api/stores/:storeId/sales/weekly?from=YYYY-MM-DD&to=YYYY-MM-DD&productId=...`

GET `/api/stores/:storeId/sales/reconciliation?period=YYYY-MM&productId=...`

GET `/api/stores/:storeId/products/xyz?asOf=YYYY-MM-DD&productId=...`

GET `/api/stores/:storeId/products/day-of-week-forecast?asOf=YYYY-MM-DD&productId=...&horizonDays=7`

Daily and weekly ranges accept either both `from` and `to`, or neither. An
omitted range ends at the latest authorized observation and spans 28 days; an
explicit range is limited to 366 days. A weekly response expands intersecting
weeks to their full ISO Monday-to-Sunday boundaries so partial coverage cannot
be hidden by a narrow query. All three reads require `analytics.read` and
validate an optional product inside the same authorized store.

The XYZ read requires `analytics.read`. Its optional `asOf` defaults to the
latest authorized daily observation for the selected scope. It returns one
result per active canonical product, or one reauthorized product when
`productId` is supplied. The response exposes the complete ISO weeks included
in the coefficient of variation, every incomplete week excluded without zero
filling, warnings, store configuration version, data revision and
`true-xyz-v1` calculation version. A historical `asOf` never loads observations
after that date; the remainder of its ISO week is therefore explicit missing
coverage.

The day-of-week forecast read also requires `analytics.read`, reauthorizes an
optional product and accepts a 1-to-28-day horizon. `asOf` defaults to the
latest authorized daily observation and no later fact is loaded. The response
contains the exact training/forecast windows, seven weekday models, forecast
days, fixed-holdout points, MAE, RMSE, mean error, WAPE, confidence, warnings,
configuration version, data revision and model version. Missing predictions
are null rather than zero.

## Context observations

GET `/api/stores/:storeId/context?from=YYYY-MM-DD&to=YYYY-MM-DD&productId=...`

POST `/api/stores/:storeId/context/promotions`

POST `/api/stores/:storeId/context/weather`

The read requires `analytics.read`; both writes require `context.write`. An
omitted range is the 14 days ending on the current UTC business date, while an
explicit pair is limited to 92 days. The optional product is revalidated in the
authorized store. The response contains raw immutable observations, one
derived promotion/weather feature per expected date, missing-date lists, data
revision and `business-context-v1` calculation version.

Promotion accepts an active mechanic with one or more authorized products, or
an explicit manual `none` observation with no promotional fields. Provenance
is manual or a published/completed commercial event that is revalidated for
store, date and products. Weather accepts a bounded condition, optional
temperatures and precipitation, plus manual or provider provenance. Mutations
use a UUID idempotency key, append an audit entry and never update sales, stock,
experiments or forecasts.

## Layout
GET `/api/stores/:storeId/layout`
POST `/api/stores/:storeId/layout/versions`
POST `/api/stores/:storeId/layout/optimize`

## TG
GET/POST `/api/stores/:storeId/commercial-events`
PATCH `/api/stores/:storeId/commercial-events/:id`

## Experiments
GET/POST `/api/stores/:storeId/experiments`
GET/PATCH `/api/stores/:storeId/experiments/:experimentId`
POST `/api/stores/:storeId/experiments/:experimentId/start`
POST `/api/stores/:storeId/experiments/:experimentId/finish`
POST `/api/stores/:storeId/experiments/:experimentId/evaluate`
GET `/api/stores/:storeId/experiments/:experimentId/analyses`
POST `/api/stores/:storeId/experiments/:experimentId/conclude`
POST `/api/stores/:storeId/commercial-events/:eventId/create-experiment`

For `control_store` and `difference_in_differences`, create/update, read,
evaluation, analysis history and conclusion reauthorize the exact frozen control
store set. The treatment store requires both `experiments.compare_stores` and
`analytics.compare_stores`; every control store requires `experiments.read` and
`analytics.read`. One unauthorized, missing or cross-organization store rejects
the whole operation.

## Markdown
GET/POST `/api/stores/:storeId/markdown`

## Inventory

GET `/api/stores/:storeId/inventory/counts?businessDate=YYYY-MM-DD` returns the
authorized article list, current profiles, latest availability evidence and the
latest count version for the selected date. It requires `inventory.read`.

POST `/api/stores/:storeId/inventory/counts` opens or reuses a persistent daily
draft. A committed count produces a new correction version rather than becoming
mutable again.

PATCH `/api/stores/:storeId/inventory/counts/:countId` saves the full draft with
`basedOnRevision` optimistic concurrency and a UUID idempotency key.

POST `/api/stores/:storeId/inventory/counts/:countId/commit` validates complete
count lines, freezes packaging evidence, versions changed product/date stock
snapshots, updates current product profiles and audits the mutation in one
transaction. All mutations require `inventory.write`.

## Manual photos
GET/POST `/api/stores/:storeId/attachments`

DELETE `/api/stores/:storeId/attachments/:attachmentId` requires a UUID
idempotency key and permanently removes metadata plus binary content.

GET `/api/stores/:storeId/attachments/:attachmentId/content` streams the
private object only after session, organization and store authorization. Upload
uses multipart form data with a Zod-validated `metadata` JSON field and a
`file` field. JPEG, PNG and WebP are accepted up to 4 Mio; the server validates
the file signature instead of trusting the MIME declaration.

## AI
POST `/api/stores/:storeId/ai/chat`
POST `/api/network/ai/chat` with explicit cross-store permission.
POST `/api/stores/:storeId/ai/action-plans/:actionPlanId/decision` with `recommendations.approve`, rationale and idempotency key. This decision never executes the proposed actions.

## Error envelope
```ts
interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string,string[]>;
  requestId: string;
}
```
