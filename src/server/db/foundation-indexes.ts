import type { Db } from "mongodb";

export async function ensureFoundationIndexesForDb(db: Db): Promise<void> {
  await Promise.all([
    db.collection("stores").createIndex(
      { organizationId: 1, code: 1 },
      { unique: true, name: "stores_org_code_unique" },
    ),
    db.collection("storeMemberships").createIndex(
      { storeId: 1, userId: 1 },
      { unique: true, name: "store_memberships_store_user_unique" },
    ),
    db.collection("productAliases").createIndex(
      { storeId: 1, source: 1, externalKey: 1 },
      { unique: true, name: "product_aliases_store_source_key_unique" },
    ),
    db.collection("importJobs").createIndex(
      { storeId: 1, fingerprint: 1, periodKey: 1 },
      { unique: true, name: "import_jobs_store_fingerprint_period_unique" },
    ),
    db.collection("products").createIndex(
      { storeId: 1, normalizedLabel: 1 },
      { name: "products_store_normalized_label" },
    ),
    db.collection("salesFacts").createIndex(
      { storeId: 1, periodKey: 1, productId: 1 },
      { unique: true, name: "sales_facts_store_period_product_unique" },
    ),
    db.collection("auditLogs").createIndex(
      { organizationId: 1, storeId: 1, createdAt: -1 },
      { name: "audit_logs_org_store_created" },
    ),
    db.collection("recommendations").createIndex(
      {
        storeId: 1,
        periodKey: 1,
        productId: 1,
        inputRevision: 1,
        modelVersion: 1,
      },
      { unique: true, name: "recommendations_input_unique" },
    ),
    db.collection("recommendationRuns").createIndex(
      {
        storeId: 1,
        periodKey: 1,
        inputRevision: 1,
        modelVersion: 1,
      },
      { unique: true, name: "recommendation_runs_input_unique" },
    ),
    db.collection("decisionLogs").createIndex(
      { storeId: 1, idempotencyKey: 1 },
      { unique: true, name: "decision_logs_store_idempotency_unique" },
    ),
    db.collection("decisionLogs").createIndex(
      { storeId: 1, createdAt: -1 },
      { name: "decision_logs_store_created" },
    ),
    db.collection("departments").createIndex(
      { organizationId: 1, storeId: 1, key: 1 },
      { unique: true, name: "departments_org_store_key_unique" },
    ),
    db.collection("layoutVersions").createIndex(
      { organizationId: 1, storeId: 1, departmentId: 1, version: 1 },
      { unique: true, name: "layout_versions_scope_version_unique" },
    ),
    db.collection("layoutVersions").createIndex(
      { organizationId: 1, storeId: 1, seedKey: 1 },
      {
        unique: true,
        sparse: true,
        name: "layout_versions_scope_seed_unique",
      },
    ),
    db.collection("layoutVersions").createIndex(
      { organizationId: 1, storeId: 1, departmentKey: 1, version: -1 },
      { name: "layout_versions_scope_latest" },
    ),
    db.collection("layoutVersions").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      {
        unique: true,
        sparse: true,
        name: "layout_versions_scope_idempotency_unique",
      },
    ),
    db.collection("allocationPlans").createIndex(
      { organizationId: 1, storeId: 1, layoutVersionId: 1, version: 1 },
      { unique: true, name: "allocation_plans_scope_version_unique" },
    ),
    db.collection("allocationPlans").createIndex(
      { organizationId: 1, storeId: 1, layoutVersionId: 1, version: -1 },
      { name: "allocation_plans_scope_latest" },
    ),
    db.collection("allocationPlans").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      {
        unique: true,
        sparse: true,
        name: "allocation_plans_scope_idempotency_unique",
      },
    ),
    db.collection("commercialEvents").createIndex(
      {
        organizationId: 1,
        storeId: 1,
        fixtureId: 1,
        startsOn: 1,
        endsOn: 1,
        status: 1,
      },
      { name: "commercial_events_scope_schedule" },
    ),
    db.collection("commercialEvents").createIndex(
      { organizationId: 1, storeId: 1, startsOn: 1 },
      { name: "commercial_events_scope_start" },
    ),
    db.collection("commercialEventCommands").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      { unique: true, name: "commercial_event_commands_scope_key_unique" },
    ),
    db.collection("experiments").createIndex(
      { organizationId: 1, storeId: 1, status: 1, plannedStartAt: -1 },
      { name: "experiments_scope_status_start" },
    ),
    db.collection("experiments").createIndex(
      { organizationId: 1, storeId: 1, productIds: 1, plannedStartAt: -1 },
      { name: "experiments_scope_products_start" },
    ),
    db.collection("experiments").createIndex(
      { organizationId: 1, storeId: 1, type: 1, plannedStartAt: -1 },
      { name: "experiments_scope_type_start" },
    ),
    db.collection("experiments").createIndex(
      { linkedCommercialEventId: 1 },
      { sparse: true, name: "experiments_commercial_event" },
    ),
    db.collection("experimentCommands").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      { unique: true, name: "experiment_commands_scope_key_unique" },
    ),
    db.collection("experimentAnalyses").createIndex(
      { experimentId: 1, analysisVersion: 1 },
      { unique: true, name: "experiment_analyses_version_unique" },
    ),
    db.collection("experimentAnalyses").createIndex(
      { organizationId: 1, storeId: 1, analyzedAt: -1 },
      { name: "experiment_analyses_scope_analyzed" },
    ),
    db.collection("experimentConclusions").createIndex(
      { experimentId: 1, active: 1 },
      {
        unique: true,
        partialFilterExpression: { active: true },
        name: "experiment_conclusions_one_active",
      },
    ),
  ]);
}
