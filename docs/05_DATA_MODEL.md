# 05 — MongoDB data model

## Collections
`stores`, `storeMemberships`, `departments`, `products`, `productAliases`, `salesFacts`, `markdownFacts`, `periodTargets`, `importJobs`, `layoutVersions`, `displayAllocations`, `commercialEvents`, `recommendationRuns`, `recommendations`, `decisionLogs`, `attachments`, `auditLogs`, `benchmarkGroups`.

## Mandatory tenant fields
All business documents include `organizationId`, `storeId` where store-scoped, and usually `departmentId`.

## Important indexes
- stores `{organizationId:1, code:1}` unique
- storeMemberships `{storeId:1,userId:1}` unique
- products `{storeId:1, normalizedLabel:1}`
- productAliases `{storeId:1, source:1, externalKey:1}` unique
- salesFacts `{storeId:1, periodKey:1, productId:1}`
- markdownFacts `{storeId:1,date:1,productId:1}`
- layoutVersions `{storeId:1,departmentId:1,version:-1}`
- recommendations `{storeId:1,periodKey:1,productId:1}`
- auditLogs `{organizationId:1,storeId:1,createdAt:-1}`

## Facts vs derived values
Never overwrite sales facts with forecasts. Derived metrics may be materialized with `calculationVersion`, `inputRevision`, `generatedAt`.

## Product identity
Mercalys labels change. Use canonical Product + ProductAlias. Unresolved labels enter mapping queue.
