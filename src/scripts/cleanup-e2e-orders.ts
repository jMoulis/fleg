/** One-off, explicitly scoped cleanup. Defaults to a read-only plan. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { MongoClient, ObjectId, BSON, type ClientSession, type Db } from "mongodb";
import * as z from "zod";
import { requireLocalMongoUri } from "../domain/testing/e2e-environment";

const argsSchema = z.object({
  organization: z.string().min(1),
  store: z.string().regex(/^[a-f0-9]{24}$/),
  "restore-uri": z.string().min(1),
  "restore-db": z.string().regex(/^fleg_restore_[a-z0-9_]+$/),
  "backup-archive": z.string().min(1),
  "confirm-database": z.string().optional(),
  apply: z.boolean().default(false),
});
const fixtureSchema = z.object({
  _id: z.instanceof(ObjectId), organizationId: z.string(), storeId: z.instanceof(ObjectId),
  status: z.literal("approved"), orderDate: z.enum(["2027-03-12", "2027-03-19"]),
  generatedAt: z.date(),
  lines: z.array(z.object({ productId: z.string(), productLabel: z.string(), status: z.enum(["ready", "no_order", "unavailable"]) })),
  decision: z.object({ lines: z.array(z.object({ productId: z.string(), suggestedCaseCount: z.literal(2), approvedCaseCount: z.literal(3), approvedOrderQuantity: z.literal(30), overrideReason: z.literal("Prudence opérationnelle locale") })).length(1) }),
});
const collections = ["orderSuggestionDrafts", "orderSuggestionCommands", "auditLogs"] as const;
type RecordDocument = { _id: ObjectId; [key: string]: unknown };
const hash = (doc: RecordDocument) => createHash("sha256").update(BSON.serialize(doc)).digest("hex");

async function run() {
  const parsed = parseArgs({ options: {
    organization: { type: "string" }, store: { type: "string" },
    "restore-uri": { type: "string" }, "restore-db": { type: "string" },
    "backup-archive": { type: "string" }, "confirm-database": { type: "string" },
    apply: { type: "boolean", default: false },
  } });
  const args = argsSchema.parse(parsed.values);
  loadEnvFile(process.env.STORAGE_ENV_FILE ?? ".env.local");
  const env = z.object({ MONGODB_URI: z.string().min(1), MONGODB_APP_DB: z.string().min(1).default("fl_cockpit_app") }).parse(process.env);
  if (args.apply && args["confirm-database"] !== env.MONGODB_APP_DB) throw new Error("Confirmation exacte de la base requise");
  const archiveHash = createHash("sha256");
  for await (const chunk of createReadStream(args["backup-archive"])) archiveHash.update(chunk);
  const backupSha256 = archiveHash.digest("hex");
  const live = new MongoClient(env.MONGODB_URI, { maxPoolSize: 1, serverSelectionTimeoutMS: 8000 });
  const restored = new MongoClient(requireLocalMongoUri(args["restore-uri"]), { maxPoolSize: 1 });
  try {
    await Promise.all([live.connect(), restored.connect()]);
    const db = live.db(env.MONGODB_APP_DB);
    const backup = restored.db(args["restore-db"]);
    const scope = { organizationId: args.organization, storeId: new ObjectId(args.store) };
    if (!await db.collection("stores").findOne({ _id: scope.storeId, organizationId: scope.organizationId, code: "DEMO-01" })) throw new Error("Magasin démo non confirmé");
    const candidates = await db.collection<RecordDocument>(collections[0]).find({ ...scope, status: "approved", orderDate: { $in: ["2027-03-12", "2027-03-19"] } }, { projection: { _id: 1 } }).toArray();
    const filters = (id: ObjectId) => [
      { ...scope, _id: id },
      { ...scope, suggestionId: id },
      { ...scope, entityType: "orderSuggestion", entityId: id },
    ];
    async function records(database: Db, id: ObjectId, session?: ClientSession) {
      const result = [];
      const selection = filters(id);
      for (let i = 0; i < collections.length; i++) {
        result.push(await database.collection<RecordDocument>(collections[i]).find(selection[i], { session }).sort({ _id: 1 }).toArray());
      }
      return result;
    }
    function validate(rows: RecordDocument[][]) {
      if (rows[0].length !== 1 || rows[1].length !== 2 || rows[2].length !== 2) throw new Error("Graphe de fixture inattendu");
      const order = fixtureSchema.parse(rows[0][0]);
      const label = `Produit commande V3-06 ${order.orderDate === "2027-03-12" ? "mobile" : "desktop"}`;
      const ready = order.lines.filter(line => line.status === "ready");
      if (ready.length !== 1 || ready[0].productLabel !== label || ready[0].productId !== order.decision.lines[0].productId) throw new Error("La proposition ne correspond pas exactement à la fixture E2E");
      if (rows[1].map(r => r.operation).sort().join() !== "approve,create" || rows[2].map(r => r.action).sort().join() !== "order_suggestion.approved,order_suggestion.generated") throw new Error("Opérations liées inattendues");
    }
    const plan = [];
    let bytes = 0;
    // Complete validation happens BEFORE deleting the first document.
    for (const candidate of candidates) {
      const current = await records(db, candidate._id);
      const saved = await records(backup, candidate._id);
      validate(current);
      if (JSON.stringify(current.map(rs => rs.map(hash))) !== JSON.stringify(saved.map(rs => rs.map(hash)))) throw new Error("La copie restaurée diffère de la source : nettoyage refusé");
      const fingerprints = current.map(rs => rs.map(hash));
      const byteCount = current.flat().reduce((sum, doc) => sum + BSON.calculateObjectSize(doc), 0);
      bytes += byteCount;
      plan.push({ id: candidate._id, fingerprints, byteCount });
    }
    // No application feature currently references an order outside its commands
    // and audit. Check the explicit reference fields as an additional tripwire.
    const ids = plan.map(p => p.id);
    for (const name of ["decisionLogs", "experiments", "attachments", "aiActionPlans"]) {
      const count = await db.collection(name).countDocuments({ ...scope, $or: [
        { suggestionId: { $in: ids } }, { orderSuggestionId: { $in: ids } }, { linkedOrderSuggestionId: { $in: ids } },
      ] });
      if (count) throw new Error("Une référence métier empêche le nettoyage");
    }
    console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", database: env.MONGODB_APP_DB, storeId: args.store, backupSha256, orders: plan.length, documents: plan.length * 5, bytes, ids: plan.map(p => p.id.toHexString()) }));
    if (!args.apply) return;
    const session = live.startSession();
    try {
      for (const item of plan) {
        await session.withTransaction(async () => {
          const current = await records(db, item.id, session);
          if (JSON.stringify(current.map(rs => rs.map(hash))) !== JSON.stringify(item.fingerprints)) throw new Error("Les données ont changé depuis le plan");
          const selection = filters(item.id);
          for (let i = 0; i < collections.length; i++) {
            const result = await db.collection(collections[i]).deleteMany({ ...selection[i], _id: { $in: current[i].map(r => r._id) } }, { session });
            if (result.deletedCount !== current[i].length) throw new Error("Suppression partielle refusée");
          }
          await db.collection("auditLogs").insertOne({ ...scope, action: "maintenance.e2e_order_fixture.removed", entityType: "orderSuggestion", entityId: item.id, actorId: "operator-authorized-storage-cleanup", backupSha256, removedDocuments: 5, removedBytes: item.byteCount, createdAt: new Date(), timestamp: new Date() }, { session });
        });
      }
    } finally { await session.endSession(); }
    console.log(JSON.stringify({ status: "completed", ordersRemoved: plan.length, documentsRemoved: plan.length * 5, recovery: args["backup-archive"] }));
  } finally { await Promise.all([live.close(), restored.close()]); }
}

run().catch(error => {
  // Driver errors can contain connection details; never print their raw message.
  console.error(error instanceof z.ZodError ? "Arguments de maintenance invalides" : "Nettoyage refusé ou interrompu ; les transactions validées restent récupérables depuis la sauvegarde. Vérifier le périmètre, la restauration et les compteurs.");
  process.exitCode = 1;
});
