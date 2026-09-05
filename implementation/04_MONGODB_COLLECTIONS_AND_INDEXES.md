# MongoDB implementation map

## Logical databases
- `fl_cockpit_auth`
- `fl_cockpit_app`

## Core collections
`stores`, `storeMemberships`, `departments`, `products`, `productAliases`, `salesFacts`, `periodTargets`, `importJobs`, `recommendationRuns`, `recommendations`, `decisionLogs`, `layoutVersions`, `allocationPlans`, `markdownFacts`, `commercialEvents`, `experiments`, `experimentAnalyses`, `experimentConclusions`, `auditLogs`.

## Required fields
All store-scoped business records carry `organizationId`, `storeId`; department records also carry `departmentId` where applicable. Derived records include `calculationVersion`, `inputRevision`, `generatedAt`.

## Minimum indexes
```ts
stores:            { organizationId: 1, code: 1 } unique
storeMemberships:  { storeId: 1, userId: 1 } unique
products:          { storeId: 1, normalizedLabel: 1 }
productAliases:    { storeId: 1, source: 1, externalKey: 1 } unique
salesFacts:        { storeId: 1, periodKey: 1, productId: 1 } unique
markdownFacts:     { organizationId: 1, storeId: 1, occurredOn: 1, productId: 1 }
markdownFacts:     { organizationId: 1, storeId: 1, periodKey: 1, productId: 1 }
markdownCommands:  { organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
importJobs:        { storeId: 1, fingerprint: 1 } unique
recommendations:   { storeId: 1, periodKey: 1, productId: 1 }
decisionLogs:      { storeId: 1, createdAt: -1 }
layoutVersions:    { storeId: 1, departmentId: 1, version: -1 }
allocationPlans:   { storeId: 1, layoutVersionId: 1, version: -1 }
commercialEvents:  { organizationId: 1, storeId: 1, fixtureId: 1, startsOn: 1, endsOn: 1, status: 1 }
commercialEventCommands: { organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
experiments:        { organizationId: 1, storeId: 1, status: 1, plannedStartAt: -1 }
experiments:        { organizationId: 1, storeId: 1, productIds: 1, plannedStartAt: -1 }
experimentCommands:{ organizationId: 1, storeId: 1, idempotencyKey: 1 } unique
experimentAnalyses:{ experimentId: 1, analysisVersion: 1 } unique
experimentAnalyses:{ experimentId: 1, dataRevision: 1, engineVersion: 1 } unique
auditLogs:         { organizationId: 1, storeId: 1, createdAt: -1 }
```

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
