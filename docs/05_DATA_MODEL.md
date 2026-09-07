# 05 — MongoDB data model

## Collections
`stores`, `storeMemberships`, `departments`, `products`, `productAliases`, `salesFacts`, `markdownFacts`, `periodTargets`, `importJobs`, `layoutVersions`, `allocationPlans`, `productSpacePolicySets`, `productSpacePolicyCommands`, `commercialEvents`, `experiments`, `experimentAnalyses`, `experimentConclusions`, `recommendationRuns`, `recommendations`, `aiActionPlans`, `decisionLogs`, `attachments`, `auditLogs`, `benchmarkGroups`.

## Mandatory tenant fields
All business documents include `organizationId`, `storeId` where store-scoped, and usually `departmentId`.

## Important indexes
- stores `{organizationId:1, code:1}` unique
- storeMemberships `{storeId:1,userId:1}` unique
- products `{storeId:1, normalizedLabel:1}`
- productAliases `{storeId:1, source:1, externalKey:1}` unique
- salesFacts `{storeId:1, periodKey:1, productId:1}`
- periodTargets `{organizationId:1,storeId:1,periodKey:1}` unique
- markdownFacts `{storeId:1,date:1,productId:1}`
- markdownCommands `{organizationId:1,storeId:1,idempotencyKey:1}` unique
- layoutVersions `{storeId:1,departmentId:1,version:-1}`
- allocationPlans `{storeId:1,layoutVersionId:1,version:-1}`
- productSpacePolicySets `{organizationId:1,storeId:1}` unique
- productSpacePolicyCommands `{organizationId:1,storeId:1,idempotencyKey:1}` unique
- attachments `{organizationId:1,storeId:1,targetKey:1,createdAt:-1}`
- attachmentObjects `{organizationId:1,storeId:1,createdAt:-1}`
- attachmentCommands `{organizationId:1,storeId:1,idempotencyKey:1}` unique
- commercialEvents `{organizationId:1,storeId:1,fixtureId:1,startsOn:1,endsOn:1,status:1}`
- commercialEventCommands `{organizationId:1,storeId:1,idempotencyKey:1}` unique
- experiments `{organizationId:1,storeId:1,status:1,plannedStartAt:-1}`
- experiments `{organizationId:1,storeId:1,productIds:1,plannedStartAt:-1}`
- experimentAnalyses `{experimentId:1,analysisVersion:1}` unique
- experimentAnalyses `{experimentId:1,dataRevision:1,engineVersion:1,controlRevisionKey:1}` unique
- experimentConclusions `{organizationId:1,storeId:1,experimentId:1,active:1}` unique when active
- experimentConclusions `{organizationId:1,storeId:1,idempotencyKey:1}` unique
- recommendations `{storeId:1,periodKey:1,productId:1}`
- aiActionPlans `{organizationId:1,storeId:1,idempotencyKey:1}` unique
- aiActionPlans `{organizationId:1,storeId:1,status:1,createdAt:-1}`
- auditLogs `{organizationId:1,storeId:1,createdAt:-1}`

## Facts vs derived values
Never overwrite sales facts with forecasts. Derived metrics may be materialized with `calculationVersion`, `inputRevision`, `generatedAt`.

## V3 additive granular facts

`V3-01` adds `dailySalesImportJobs` and `dailySalesFacts`; it does not replace
monthly `importJobs` or `salesFacts`. Daily facts are append-versioned with one
active document per authorized store, product and business date. `periodKey`
and `isoWeekKey` are deterministic derivatives of the source business date.

Planned indexes:

- dailySalesImportJobs `{organizationId:1,storeId:1,fingerprint:1,coverageKey:1}` unique
- dailySalesFacts `{organizationId:1,storeId:1,productId:1,businessDate:1}` unique where `active:true`
- dailySalesFacts `{organizationId:1,storeId:1,productId:1,businessDate:1,version:1}` unique
- dailySalesFacts `{organizationId:1,storeId:1,businessDate:1,active:1}`
- dailySalesFacts `{organizationId:1,storeId:1,isoWeekKey:1,active:1}`

Weekly values are calculated views over active daily facts. They remain derived
values carrying a calculation version, data revision and coverage evidence.
Monthly and daily observations for the same calendar month remain separate and
are never summed.

Allocation plans preserve their product-policy snapshot, input revisions, configurable coefficients, known-component markdown economics and limitations. Missing markdown and suitability remain explicit unknowns.

Photo metadata lives in `attachments`; private binary content lives separately in
`attachmentObjects` under the same attachment `_id`, `organizationId` and
`storeId`. Target keys preserve the layout version for fixture photos. Deletion
removes both records permanently while the audit entry and idempotency command
remain as evidence of the mutation.

## Product identity
Mercalys labels change. Use canonical Product + ProductAlias. Unresolved labels enter mapping queue.
