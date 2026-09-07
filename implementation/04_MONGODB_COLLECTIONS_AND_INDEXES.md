# MongoDB implementation map

## Logical databases
- `fl_cockpit_auth`
- `fl_cockpit_app`

## Core collections
`stores`, `storeMemberships`, `departments`, `products`, `productAliases`, `salesFacts`, `periodTargets`, `importJobs`, `recommendationRuns`, `recommendations`, `aiActionPlans`, `decisionLogs`, `layoutVersions`, `allocationPlans`, `productSpacePolicySets`, `productSpacePolicyCommands`, `attachments`, `attachmentObjects`, `attachmentCommands`, `markdownFacts`, `commercialEvents`, `experiments`, `experimentAnalyses`, `experimentConclusions`, `auditLogs`.

## Required fields
All store-scoped business records carry `organizationId`, `storeId`; department records also carry `departmentId` where applicable. Derived records include `calculationVersion`, `inputRevision`, `generatedAt`.

## Minimum indexes
```ts
stores:            { organizationId: 1, code: 1 } unique
stores:            { organizationId: 1, active: 1, name: 1 }
storeMemberships:  { storeId: 1, userId: 1 } unique
storeMemberships:  { userId: 1, active: 1, organizationId: 1, storeId: 1 }
storeAdminCommands: { organizationId: 1, idempotencyKey: 1 } unique
storeMembershipCommands: { organizationId: 1, idempotencyKey: 1 } unique
notificationDeliveries: { idempotencyKey: 1 } unique
notificationDeliveries: { invitationId: 1, attemptedAt: -1 }
products:          { storeId: 1, normalizedLabel: 1 }
products:          { organizationId: 1, storeId: 1, active: 1, label: 1 }
productAliases:    { storeId: 1, source: 1, externalKey: 1 } unique
salesFacts:        { storeId: 1, periodKey: 1, productId: 1 } unique
salesFacts:        { organizationId: 1, storeId: 1, periodKey: 1 }
storeSettings:     { organizationId: 1, storeId: 1 } unique
periodTargets:     { organizationId: 1, storeId: 1, periodKey: 1 } unique
markdownFacts:     { organizationId: 1, storeId: 1, occurredOn: 1, productId: 1 }
markdownFacts:     { organizationId: 1, storeId: 1, periodKey: 1, productId: 1 }
markdownCommands:  { organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
importJobs:        { storeId: 1, fingerprint: 1 } unique
recommendations:   { storeId: 1, periodKey: 1, productId: 1 }
recommendations:   { organizationId: 1, periodKey: 1, status: 1, storeId: 1, inputRevision: 1 }
decisionLogs:      { storeId: 1, createdAt: -1 }
aiActionPlans:     { organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
aiActionPlans:     { organizationId: 1, storeId: 1, status: 1, createdAt: -1 }
layoutVersions:    { storeId: 1, departmentId: 1, version: -1 }
allocationPlans:   { storeId: 1, layoutVersionId: 1, version: -1 }
productSpacePolicySets: { organizationId: 1, storeId: 1 } unique
productSpacePolicyCommands: { organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
attachments:       { organizationId: 1, storeId: 1, targetKey: 1, createdAt: -1 }
attachmentObjects: { organizationId: 1, storeId: 1, createdAt: -1 }
attachmentCommands:{ organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
commercialEvents:  { organizationId: 1, storeId: 1, fixtureId: 1, startsOn: 1, endsOn: 1, status: 1 }
commercialEventCommands: { organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
experiments:        { organizationId: 1, storeId: 1, status: 1, plannedStartAt: -1 }
experiments:        { organizationId: 1, storeId: 1, productIds: 1, plannedStartAt: -1 }
experimentCommands:{ organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
experimentAnalyses:{ experimentId: 1, analysisVersion: 1 } unique
experimentAnalyses:{ experimentId: 1, dataRevision: 1, engineVersion: 1, controlRevisionKey: 1 } unique
experimentConclusions:{ organizationId: 1, storeId: 1, experimentId: 1, active: 1 } unique when active
experimentConclusions:{ organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
auditLogs:         { organizationId: 1, storeId: 1, createdAt: -1 }
```

The application ensures this index set once per process before returning the first application database handle. A rejected bootstrap is evicted so a later readiness attempt can recover. `GET /api/health` is the pre-traffic warm-up and confirms both MongoDB connectivity and index readiness.

## Planned V3-01 additive collections

```ts
dailySalesImportJobs: { organizationId: 1, storeId: 1, fingerprint: 1, coverageKey: 1 } unique
dailySalesImportJobs: { organizationId: 1, storeId: 1, status: 1, createdAt: -1 }
dailySalesFacts:      { organizationId: 1, storeId: 1, productId: 1, businessDate: 1 } unique where active = true
dailySalesFacts:      { organizationId: 1, storeId: 1, productId: 1, businessDate: 1, version: 1 } unique
dailySalesFacts:      { organizationId: 1, storeId: 1, businessDate: 1, active: 1 }
dailySalesFacts:      { organizationId: 1, storeId: 1, isoWeekKey: 1, active: 1 }
dailySalesFacts:      { importJobId: 1, active: 1 }
```

These collections are not aliases for monthly `importJobs` or `salesFacts`.
Weekly values are derived rather than stored as a second observed fact source.

## Sales fact example
```ts
{
  organizationId,
  storeId,
  departmentId,
  productId,
  periodKey: '2026-08',
  quantity: 2616529,       // choose documented quantity precision convention
  revenueCents: 5889079,
  marginCents: 1720231,
  source: 'mercalys',
  importJobId,
  createdAt
}
```

Do not store `% Marge` as an authoritative fact if it can be recomputed from margin/revenue; preserve source value only as import metadata when needed for reconciliation.
