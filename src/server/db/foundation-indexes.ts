import { MongoServerError, type Db } from "mongodb";

interface ListedIndex {
  name?: string;
  key?: Record<string, unknown>;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

async function migrateExperimentAnalysisInputIndex(db: Db): Promise<void> {
  const analyses = db.collection("experimentAnalyses");
  let indexes: ListedIndex[] = [];

  try {
    indexes = await analyses.listIndexes().toArray();
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 26) throw error;
  }
  const current = indexes.find(
    ({ name }) => name === "experiment_analyses_input_unique",
  );
  if (current && current.key?.controlRevisionKey !== 1) {
    await analyses.dropIndex("experiment_analyses_input_unique");
  }
}

async function migrateLayoutOptionalUniqueIndexes(db: Db): Promise<void> {
  const layouts = db.collection("layoutVersions");
  let indexes: ListedIndex[] = [];

  try {
    indexes = await layouts.listIndexes().toArray();
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 26) throw error;
  }

  const optionalIndexes = [
    {
      field: "seedKey",
      name: "layout_versions_scope_seed_unique",
    },
    {
      field: "idempotencyKey",
      name: "layout_versions_scope_idempotency_unique",
    },
  ] as const;

  for (const definition of optionalIndexes) {
    const current = indexes.find(({ name }) => name === definition.name);
    const fieldFilter = current?.partialFilterExpression?.[definition.field];
    const hasStringPartialFilter =
      typeof fieldFilter === "object" &&
      fieldFilter !== null &&
      "$type" in fieldFilter &&
      fieldFilter.$type === "string";

    if (current && (current.sparse || !hasStringPartialFilter)) {
      await layouts.dropIndex(definition.name);
    }
  }
}

export async function ensureFoundationIndexesForDb(db: Db): Promise<void> {
  await migrateExperimentAnalysisInputIndex(db);
  await migrateLayoutOptionalUniqueIndexes(db);
  await Promise.all([
    db.collection("stores").createIndex(
      { organizationId: 1, code: 1 },
      { unique: true, name: "stores_org_code_unique" },
    ),
    db.collection("stores").createIndex(
      { organizationId: 1, active: 1, name: 1 },
      { name: "stores_org_active_name" },
    ),
    db.collection("storeMemberships").createIndex(
      { storeId: 1, userId: 1 },
      { unique: true, name: "store_memberships_store_user_unique" },
    ),
    db.collection("storeMemberships").createIndex(
      { userId: 1, active: 1, organizationId: 1, storeId: 1 },
      { name: "store_memberships_user_active_scope" },
    ),
    db.collection("storeAdminCommands").createIndex(
      { organizationId: 1, idempotencyKey: 1 },
      { unique: true, name: "store_admin_commands_scope_key_unique" },
    ),
    db.collection("storeMembershipCommands").createIndex(
      { organizationId: 1, idempotencyKey: 1 },
      { unique: true, name: "store_membership_commands_scope_key_unique" },
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
    db.collection("products").createIndex(
      { organizationId: 1, storeId: 1, active: 1, label: 1 },
      { name: "products_scope_active_label" },
    ),
    db.collection("salesFacts").createIndex(
      { storeId: 1, periodKey: 1, productId: 1 },
      { unique: true, name: "sales_facts_store_period_product_unique" },
    ),
    db.collection("salesFacts").createIndex(
      { organizationId: 1, storeId: 1, periodKey: 1 },
      { name: "sales_facts_scope_period" },
    ),
    db.collection("storeSettings").createIndex(
      { organizationId: 1, storeId: 1 },
      { unique: true, name: "store_settings_scope_unique" },
    ),
    db.collection("periodTargets").createIndex(
      { organizationId: 1, storeId: 1, periodKey: 1 },
      { unique: true, name: "period_targets_scope_period_unique" },
    ),
    db.collection("storeConfigurationCommands").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      { unique: true, name: "store_configuration_commands_scope_key_unique" },
    ),
    db.collection("markdownFacts").createIndex(
      { organizationId: 1, storeId: 1, occurredOn: 1, productId: 1 },
      { name: "markdown_facts_scope_date_product" },
    ),
    db.collection("markdownFacts").createIndex(
      { organizationId: 1, storeId: 1, periodKey: 1, productId: 1 },
      { name: "markdown_facts_scope_period_product" },
    ),
    db.collection("markdownCommands").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      { unique: true, name: "markdown_commands_scope_key_unique" },
    ),
    db.collection("auditLogs").createIndex(
      { organizationId: 1, storeId: 1, createdAt: -1 },
      { name: "audit_logs_org_store_created" },
    ),
    db.collection("notificationDeliveries").createIndex(
      { idempotencyKey: 1 },
      { unique: true, name: "notification_deliveries_key_unique" },
    ),
    db.collection("notificationDeliveries").createIndex(
      { invitationId: 1, attemptedAt: -1 },
      { name: "notification_deliveries_invitation_latest" },
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
    db.collection("recommendations").createIndex(
      { organizationId: 1, periodKey: 1, status: 1, storeId: 1, inputRevision: 1 },
      { name: "recommendations_network_period_status" },
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
    db.collection("aiActionPlans").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      { unique: true, name: "ai_action_plans_scope_key_unique" },
    ),
    db.collection("aiActionPlans").createIndex(
      { organizationId: 1, storeId: 1, status: 1, createdAt: -1 },
      { name: "ai_action_plans_scope_status_created" },
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
        partialFilterExpression: { seedKey: { $type: "string" } },
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
        partialFilterExpression: { idempotencyKey: { $type: "string" } },
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
      {
        experimentId: 1,
        dataRevision: 1,
        engineVersion: 1,
        controlRevisionKey: 1,
      },
      { unique: true, name: "experiment_analyses_input_unique" },
    ),
    db.collection("experimentAnalyses").createIndex(
      { organizationId: 1, storeId: 1, analyzedAt: -1 },
      { name: "experiment_analyses_scope_analyzed" },
    ),
    db.collection("experimentConclusions").createIndex(
      { organizationId: 1, storeId: 1, experimentId: 1, active: 1 },
      {
        unique: true,
        partialFilterExpression: { active: true },
        name: "experiment_conclusions_scope_one_active",
      },
    ),
    db.collection("experimentConclusions").createIndex(
      { organizationId: 1, storeId: 1, idempotencyKey: 1 },
      {
        unique: true,
        name: "experiment_conclusions_scope_key_unique",
      },
    ),
  ]);
}
