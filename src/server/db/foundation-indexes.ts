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
  ]);
}
