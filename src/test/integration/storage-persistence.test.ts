import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, BSON, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { buildOrderSuggestionLine } from "@/domain/ordering/calculations";
import { defaultOrderSuggestionConfig, type OrderSuggestionDraft } from "@/domain/ordering/schemas";
import { orderEvidenceReference, verifyOrderEvidence } from "@/domain/ordering/evidence";
import { requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import { OrderSuggestionRepository } from "@/server/repositories/order-suggestion-repository";
import { RecommendationRepository } from "@/server/repositories/recommendation-repository";
import { DecisionRepository } from "@/server/repositories/decision-repository";
import { productMetricSchema } from "@/domain/analytics/schemas";
import { buildRecommendation } from "@/domain/recommendations/engine";
import { defaultRecommendationConfig } from "@/domain/recommendations/schemas";
import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const uri = process.env.STORAGE_TEST_MONGODB_URI;
const context: AuthorizedStoreContext = { organizationId: "storage-org", storeId: new ObjectId().toHexString(), userId: "manager", role: "organization_admin", permissions: ["analytics.read", "inventory.read", "recommendations.approve"] };
const foreign = { ...context, organizationId: "foreign-org", storeId: new ObjectId().toHexString() };
const productId = new ObjectId().toHexString();
const draft: Omit<OrderSuggestionDraft, "id" | "status" | "generatedBy" | "generatedAt" | "decision"> = {
  organizationId: context.organizationId, storeId: context.storeId, orderDate: "2026-09-11", deliveryDate: "2026-09-12", coverageDates: ["2026-09-12", "2026-09-13"],
  lines: Array.from({ length: 500 }, (_, i) => buildOrderSuggestionLine({ product: { id: new ObjectId().toHexString(), label: `Produit ${i}` }, stockSnapshot: null, forecast: null, coverageDates: ["2026-09-12", "2026-09-13"], targetClosingStockRatio: 0 })),
  readyLineCount: 0, noOrderLineCount: 0, unavailableLineCount: 500, inputRevision: 1, forecastAsOf: "2026-09-10", forecastModelVersion: "test-v1", forecastConfigurationVersion: "test-v1", config: defaultOrderSuggestionConfig, assumptions: ["Test"], limitations: ["Aucune commande transmise"],
};

describe("compact order evidence", () => {
  it("reconstructs creation after approval, fixes field order, and rejects tampering", () => {
    const created = { ...draft, id: new ObjectId().toHexString(), status: "draft" as const, generatedBy: "manager", generatedAt: new Date().toISOString(), decision: null };
    const reference = orderEvidenceReference(created, "create");
    const approved = { ...created, status: "approved" as const, decision: { approvedBy: "manager", approvedAt: new Date().toISOString(), note: null, lines: [] } };
    expect(verifyOrderEvidence(approved, reference)).toEqual(created);
    expect(() => verifyOrderEvidence({ ...approved, inputRevision: 999 }, reference)).toThrow();
  });
});

describe.skipIf(!uri)("real MongoDB storage persistence (isolated)", () => {
  let client: MongoClient;
  let db: Db;
  beforeAll(async () => {
    client = new MongoClient(requireLocalMongoUri(uri!), { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(`fleg_storage_test_${randomUUID().replaceAll("-", "")}`);
    await ensureFoundationIndexesForDb(db);
    await db.collection("stores").insertMany([context, foreign].map(c => ({ _id: new ObjectId(c.storeId), organizationId: c.organizationId, code: c.storeId, active: true, dataRevision: 1 })));
  }, 30_000);
  afterAll(async () => {
    if (db) await db.dropDatabase();
    await client?.close();
  });

  it("stores one canonical order, replays both operations exactly, and rejects foreign access", async () => {
    const repo = new OrderSuggestionRepository(db, client);
    const input = { context, idempotencyKey: randomUUID(), requestId: randomUUID(), expectedDataRevision: 1, draft };
    const created = await repo.createDraft(input);
    const approval = { context, suggestionId: created.id, requestId: randomUUID(), approvalInput: { idempotencyKey: randomUUID(), basedOnGeneratedAt: created.generatedAt, lines: [], note: null } };
    const approved = await repo.approve(approval);
    expect(await repo.createDraft(input)).toEqual(created);
    expect(await repo.approve(approval)).toEqual(approved);
    await expect(repo.approve({ ...approval, context: foreign })).rejects.toThrow();
    const commands = await db.collection("orderSuggestionCommands").find({ storeId: new ObjectId(context.storeId) }).toArray();
    expect(commands).toHaveLength(2);
    expect(commands.every(c => !c.snapshot && c.evidence)).toBe(true);
    const audit = await db.collection("auditLogs").find({ entityId: new ObjectId(created.id) }).toArray();
    expect(audit).toHaveLength(2);
    const overhead = [...commands, ...audit].reduce((s, doc) => s + BSON.calculateObjectSize(doc), 0);
    expect(overhead).toBeLessThan(BSON.calculateObjectSize(created) / 20);

    const legacyKey = randomUUID();
    await db.collection("orderSuggestionCommands").insertOne({ organizationId: context.organizationId, storeId: new ObjectId(context.storeId), idempotencyKey: legacyKey, suggestionId: new ObjectId(created.id), operation: "create", snapshot: created, createdAt: new Date() });
    expect(await repo.createDraft({ ...input, idempotencyKey: legacyKey })).toEqual(created);
  });

  it("bounds cache generations without expiring decision evidence or another store", async () => {
    const repo = new RecommendationRepository(db);
    const generatedAt = new Date().toISOString();
    const metric = productMetricSchema.parse({ productId, label: "Banane", periodKey: "2026-08", quantity: 10, revenueCents: 20000, marginCents: 6000, marginRatio: 0.3, priorYearRevenueCents: 18000, yearOverYearRatio: 0.111, rawSeasonalityIndex: 1.2, retainedSeasonalityIndex: 1.2, forecastRevenueCents: 24000, abcClass: "A", cumulativeRevenueShare: 0.5, confidence: "high", evidence: ["Historique"] });
    const recommendation = buildRecommendation({ organizationId: context.organizationId, storeId: context.storeId, metric, config: defaultRecommendationConfig, calculationVersion: "test-v1", inputRevision: 1, generatedAt });
    const input = { context, periodKey: metric.periodKey, inputRevision: 1, calculationVersion: "test-v1", modelVersion: recommendation.modelVersion, generatedAt, drafts: [recommendation] };
    const [saved] = await repo.saveRun(input);
    expect(await repo.findRun(input)).toEqual([saved]);
    const [other] = await repo.saveRun({ ...input, context: foreign, drafts: [{ ...recommendation, storeId: foreign.storeId, organizationId: foreign.organizationId }] });
    await new DecisionRepository(db, client).recordRecommendationDecision({ context, recommendationId: saved.id, decisionInput: { idempotencyKey: randomUUID(), decision: "accepted" }, requestId: randomUUID() });
    await repo.saveRun({ ...input, inputRevision: 2, drafts: [{ ...recommendation, inputRevision: 2 }] });
    const pinned = await db.collection("recommendations").findOne({ _id: new ObjectId(saved.id) });
    expect(pinned?.retention).toBe("evidence");
    expect(pinned?.expiresAt).toBeUndefined();
    const untouched = await db.collection("recommendations").findOne({ _id: new ObjectId(other.id) });
    expect(untouched?.retention).toBe("cache");
    expect(untouched?.expiresAt).toBeInstanceOf(Date);
    const second = await db.collection("recommendations").findOne({ storeId: new ObjectId(context.storeId), inputRevision: 2 });
    await repo.saveRun({ ...input, inputRevision: 3, drafts: [{ ...recommendation, inputRevision: 3 }] });
    const superseded = await db.collection("recommendations").findOne({ _id: second?._id });
    expect(superseded?.expiresAt.getTime()).toBeLessThan(second?.expiresAt.getTime());
    // Simulate TTL deleting a cache document but not yet its run marker.
    await db.collection("recommendations").deleteOne({ _id: second?._id });
    expect(await repo.findRun({ ...input, inputRevision: 2 })).toBeNull();
  });
});
