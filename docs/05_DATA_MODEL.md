# 05 — MongoDB data model

## Collections
`stores`, `storeMemberships`, `departments`, `products`, `productAliases`, `salesFacts`, `dailySalesFacts`, `markdownFacts`, `promotionContextObservations`, `weatherContextObservations`, `contextObservationCommands`, `inventoryProductProfiles`, `inventoryCounts`, `stockSnapshots`, `inventoryCommands`, `periodTargets`, `importJobs`, `dailySalesImportJobs`, `layoutVersions`, `allocationPlans`, `productSpacePolicySets`, `productSpacePolicyCommands`, `commercialEvents`, `experiments`, `experimentAnalyses`, `experimentConclusions`, `recommendationRuns`, `recommendations`, `aiActionPlans`, `decisionLogs`, `attachments`, `auditLogs`, `benchmarkGroups`.

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
- promotionContextObservations `{organizationId:1,storeId:1,businessDate:1,recordedAt:1}`
- promotionContextObservations `{organizationId:1,storeId:1,productIds:1,businessDate:1}`
- weatherContextObservations `{organizationId:1,storeId:1,businessDate:1,recordedAt:1}`
- contextObservationCommands `{organizationId:1,storeId:1,idempotencyKey:1}` unique
- inventoryProductProfiles `{organizationId:1,storeId:1,productId:1}` unique
- inventoryCounts `{organizationId:1,storeId:1,businessDate:1,version:1}` unique
- inventoryCounts `{organizationId:1,storeId:1,businessDate:1}` unique where `status:"draft"`
- stockSnapshots `{organizationId:1,storeId:1,productId:1,businessDate:1}` unique where `active:true`
- stockSnapshots `{organizationId:1,storeId:1,productId:1,businessDate:1,version:1}` unique
- inventoryCommands `{organizationId:1,storeId:1,idempotencyKey:1}` unique
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

`V3-03` does not add a persistence collection. True XYZ is a deterministic
derived view over active `dailySalesFacts`. Each response freezes the candidate
window, store configuration version, data revision, calculation version,
included complete weeks and excluded-week evidence. The existing monthly
`demand_stability_proxy` remains a separate value and is never overwritten.

`V3-04` also remains a deterministic derived view. The day-of-week forecast
response freezes the authorized training and forecast windows, current store
configuration version, active-fact data revision, model version, weekday
coefficients, holdout points and error metrics. No forecast collection is added
and no daily or monthly observed fact is mutated.

`V3-05` adds two separate immutable evidence logs. Promotion observations
record either an active product-scoped mechanic or an explicit store-level
absence; weather observations record a bounded condition and optional
temperature/precipitation values. Both freeze source provenance, business date,
actor and recording time. A later record does not update or delete the earlier
record. The derived daily context view applies the latest explicit
no-promotion reset before aggregating later applicable promotions, and selects
the latest weather record while exposing its observation count. Missing
promotion or weather dates remain explicit. Context writes are idempotent,
audited and increment `stores.dataRevision` once.

`V3-06` adds `orderSuggestionDrafts` and `orderSuggestionCommands`. A draft
freezes the exact stock snapshot evidence, covered forecast days, configuration
and source revisions, just-in-time assumptions, limitations and pack-rounded
calculation for every product. Approval adds an immutable manager decision with
the accepted case count and mandatory rationale for each override. It does not
create a supplier-order fact and does not increment the observed-data revision.

Planned indexes:

- orderSuggestionDrafts `{organizationId:1,storeId:1,orderDate:1,generatedAt:-1}`
- orderSuggestionDrafts `{organizationId:1,storeId:1,status:1,deliveryDate:1}`
- orderSuggestionCommands `{organizationId:1,storeId:1,idempotencyKey:1}` unique

`V3-02` adds current `inventoryProductProfiles`, versioned `inventoryCounts` and
append-versioned `stockSnapshots`. Profiles hold the current manual family,
unit and last-known pack-size prefill. Each committed snapshot freezes the
family, unit, case count, pack size, shelf remainder and calculated on-hand
quantity that were actually observed. One active version exists per authorized
store, product and business date; a correction deactivates and supersedes the
previous version transactionally. `onOrderQuantity` and `reservedQuantity`
remain explicit nulls until a trustworthy source is introduced.

Allocation plans preserve their product-policy snapshot, input revisions, configurable coefficients, known-component markdown economics and limitations. Missing markdown and suitability remain explicit unknowns.

Photo metadata lives in `attachments`; private binary content lives separately in
`attachmentObjects` under the same attachment `_id`, `organizationId` and
`storeId`. Target keys preserve the layout version for fixture photos. Deletion
removes both records permanently while the audit entry and idempotency command
remain as evidence of the mutation.

## Product identity
Mercalys labels change. Use canonical Product + ProductAlias. Unresolved labels enter mapping queue.
