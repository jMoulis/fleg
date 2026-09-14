import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  ObjectId,
  type ClientSession,
  type Db,
  type MongoClient,
} from "mongodb";
import { z } from "zod";
import {
  briefMatchSchema,
  briefPagesSchema,
  briefPolicy,
  briefReviewSchema,
  briefStatusSchema,
  briefUsageSchema,
  type BriefStatus,
} from "@/domain/commercial-briefs/schemas";
import { normalizeExternalKey } from "@/domain/imports/normalization";
import {
  validateBriefExtraction,
  validateBriefValues,
} from "@/domain/commercial-briefs/validation";
import { extractedPagesSchema } from "@/domain/attachments/document-processing";
import { documentSourceIdSchema } from "@/domain/attachments/document-source";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { authorizeUploadAuthor } from "@/server/auth/upload-author-context";
import {
  briefModelConfigSchema,
  buildBriefRequest,
  reservedBriefCost,
  type BriefModelConfig,
} from "@/server/services/commercial-brief-provider";

const storedSchema = briefStatusSchema.extend({
  _id: z.string(),
  organizationId: z.string(),
  storeId: z.instanceof(ObjectId),
  ownerId: z.string(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.date(),
  expiresAtDate: z.date(),
  leaseUntil: z.date().optional(),
  config: briefModelConfigSchema,
  responseModel: z.string().optional(),
});
type StoredBrief = z.infer<typeof storedSchema>;
type Scope = { organizationId: string; storeId: ObjectId };
function deny(message = "Document introuvable ou accès refusé") {
  return new PrivateStorageError("UPLOAD_NOT_FOUND", message);
}
function conflict(message: string) {
  return new PrivateStorageError("UPLOAD_CONFLICT", message);
}
function scopeOf(
  context: AuthorizedStoreContext,
  permission: "stores.read" | "imports.create" | "imports.commit",
) {
  if (!context.permissions.includes(permission))
    throw new StoreAccessDeniedError();
  return {
    organizationId: context.organizationId,
    storeId: new ObjectId(context.storeId),
  };
}
function present(job: StoredBrief) {
  // Internal scope, billing policy and author details never flow from provider output.
  const {
    _id,
    organizationId,
    storeId,
    ownerId,
    checksumSha256,
    createdAt,
    expiresAtDate,
    leaseUntil,
    config,
    responseModel,
    ...status
  } = job;
  void [
    _id,
    organizationId,
    storeId,
    ownerId,
    checksumSha256,
    createdAt,
    expiresAtDate,
    leaseUntil,
    config,
    responseModel,
  ];
  return briefStatusSchema.parse(status);
}

export class CommercialBriefRepository {
  private jobs;
  constructor(
    private db: Db,
    private authDb: Db,
    private client: MongoClient,
    private now = () => new Date(),
  ) {
    this.jobs = db.collection<StoredBrief>("commercialBriefs");
  }
  private async transaction<T>(fn: (session: ClientSession) => Promise<T>) {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(() => fn(session));
    } finally {
      await session.endSession();
    }
  }
  private async source(
    scope: Scope,
    sourceId: string,
    session?: ClientSession,
    fence = false,
    checksum?: string,
  ) {
    const filter = {
      ...scope,
      _id: new ObjectId(documentSourceIdSchema.parse(sourceId)),
      storageState: "linked",
      ...(checksum ? { checksumSha256: checksum } : {}),
    };
    const source = fence
      ? await this.db
          .collection("documentSources")
          .findOneAndUpdate(
            filter,
            { $inc: { processingFence: 1 } },
            { session, returnDocument: "after" },
          )
      : await this.db
          .collection("documentSources")
          .findOne(filter, { session });
    if (!source) throw deny();
    return z
      .object({
        checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
        mimeType: z.literal("application/pdf"),
      })
      .parse(source);
  }
  private async authorize(
    scope: Scope,
    ownerId: string,
    permission: "imports.create" | "imports.commit",
    session?: ClientSession,
  ) {
    const current = await authorizeUploadAuthor({
      db: this.db,
      authDb: this.authDb,
      ...scope,
      ownerId,
      session,
    });
    if (!current.permissions.includes(permission))
      throw new StoreAccessDeniedError();
  }
  private async audit(
    scope: Scope,
    job: StoredBrief,
    actorId: string,
    action: string,
    session: ClientSession,
  ) {
    await this.db
      .collection("auditLogs")
      .insertOne(
        {
          ...scope,
          actorId,
          action,
          entityType: "commercialBrief",
          entityId: job.id,
          revision: job.revision,
          requestId: randomUUID(),
          createdAt: this.now(),
          timestamp: this.now(),
        },
        { session },
      );
  }
  async get(context: AuthorizedStoreContext, sourceId: string) {
    const scope = scopeOf(context, "stores.read");
    const source = await this.source(scope, sourceId);
    const job = await this.jobs.findOne({
      ...scope,
      sourceId,
      checksumSha256: source.checksumSha256,
      expiresAtDate: { $gt: this.now() },
    });
    await this.source(scope, sourceId, undefined, false, source.checksumSha256);
    return job ? present(storedSchema.parse(job)) : null;
  }
  async enqueue(
    context: AuthorizedStoreContext,
    sourceId: string,
    rawPages: unknown,
    rawConfig: BriefModelConfig,
  ) {
    const scope = scopeOf(context, "imports.create");
    const selected = z
      .array(z.number().int().min(1).max(60))
      .min(1)
      .max(briefPolicy.maxPages)
      .parse(rawPages);
    if (new Set(selected).size !== selected.length)
      throw conflict("Pages répétées");
    const config = briefModelConfigSchema.parse(rawConfig);
    return this.transaction(async (session) => {
      await this.authorize(scope, context.userId, "imports.create", session);
      const source = await this.source(scope, sourceId, session, true);
      const id = createHash("sha256")
        .update(
          JSON.stringify([
            scope.organizationId,
            context.storeId,
            source.checksumSha256,
            briefPolicy.version,
          ]),
        )
        .digest("hex");
      const existing = await this.jobs.findOne(
        { ...scope, _id: id },
        { session },
      );
      if (existing) {
        if (
          existing.sourceId !== sourceId ||
          existing.expiresAtDate <= this.now()
        )
          throw conflict(
            "Ce PDF possède déjà une analyse. Consultez le document initial ; ne le renvoyez pas.",
          );
        if (
          JSON.stringify(existing.pages.map((p) => p.page)) !==
          JSON.stringify([...selected].sort((a, b) => a - b))
        )
          throw conflict(
            "Ce PDF a déjà été analysé avec une autre sélection de pages. Consultez le brouillon existant.",
          );
        return present(storedSchema.parse(existing));
      }
      const native = await this.db
        .collection("documentProcessingJobs")
        .findOne(
          {
            ...scope,
            sourceId: new ObjectId(sourceId),
            checksumSha256: source.checksumSha256,
            state: "ready",
            expiresAt: { $gt: this.now() },
          },
          { session },
        );
      if (!native)
        throw conflict("Extrayez d’abord le texte du PDF, puis actualisez.");
      const extracted = extractedPagesSchema.parse(native.result);
      const pages = briefPagesSchema.parse(
        selected
          .sort((a, b) => a - b)
          .map((page) => extracted.pages.find((p) => p.page === page)),
      );
      buildBriefRequest(pages, config.model); // Enforce the entire UTF-8 envelope before admission.
      const now = this.now();
      // Same source fence serializes duplicates; store fence serializes the job cap
      // and per-day reservation across documents. No refunded uncertain attempts.
      await this.db
        .collection("stores")
        .updateOne(
          {
            organizationId: scope.organizationId,
            _id: scope.storeId,
            active: true,
          },
          { $inc: { commercialBriefFence: 1 } },
          { session },
        );
      if (
        (await this.jobs.countDocuments(scope, { session })) >=
        briefPolicy.maxJobsPerStore
      )
        throw conflict("Limite de brouillons atteinte");
      const budgetId = `${scope.organizationId}/${context.storeId}/${now.toISOString().slice(0, 10)}`;
      const budgets = this.db.collection<{
        _id: string;
        reserved: number;
        expiresAt: Date;
      }>("commercialBriefBudgets");
      const budget = await budgets.findOne(
        { _id: budgetId, ...scope },
        { session },
      );
      const reserved = reservedBriefCost(config);
      if ((budget?.reserved ?? 0) + reserved > config.dailyBudgetCents)
        throw conflict("Budget quotidien d’analyse atteint");
      await budgets.updateOne(
        { _id: budgetId, ...scope },
        {
          $inc: { reserved },
          $setOnInsert: {
            ...scope,
            expiresAt: new Date(now.getTime() + 35 * 86400_000),
          },
        },
        { upsert: true, session },
      );
      const expiry = new Date(now.getTime() + briefPolicy.retentionMs);
      const job = storedSchema.parse({
        _id: id,
        id,
        ...scope,
        ownerId: context.userId,
        sourceId,
        checksumSha256: source.checksumSha256,
        state: "queued",
        revision: 0,
        model: config.model,
        policyVersion: briefPolicy.version,
        createdAt: now,
        expiresAt: expiry.toISOString(),
        expiresAtDate: expiry,
        pages,
        extraction: null,
        reviews: [],
        usage: null,
        error: null,
        config,
      });
      await this.jobs.insertOne(job, { session });
      await this.audit(
        scope,
        job,
        context.userId,
        "commercial_brief.requested",
        session,
      );
      return present(job);
    });
  }
  async matches(context: AuthorizedStoreContext, brief: BriefStatus) {
    const scope = scopeOf(context, "stores.read");
    await this.source(scope, brief.sourceId);
    const matches = [];
    for (const [section, entry] of (
      brief.extraction?.sections ?? []
    ).entries()) {
      const review = brief.reviews.find((r) => r.section === section);
      const fields =
        review?.decision === "confirmed" ? review.values : entry.fields;
      const identifiers = fields.filter(
        (f) =>
          ["plu", "ean", "gencod"].includes(f.key) &&
          typeof f.value === "string",
      );
      const keys = identifiers.map(
        (f) =>
          `${f.key === "gencod" && /^\d{8,14}$/.test(String(f.value)) ? "ean" : f.key}:${f.value}`,
      );
      const aliases = keys.length
        ? await this.db
            .collection("productAliases")
            .find({ ...scope, source: "mercalys", externalKey: { $in: keys } })
            .limit(10)
            .toArray()
        : [];
      const targets = new Set(
        aliases.map((a) =>
          a.ignored || !(a.productId instanceof ObjectId)
            ? "unresolved"
            : a.productId.toHexString(),
        ),
      );
      let method: "identifier" | "label" | "unresolved" | "ambiguous" =
        targets.size > 1 ? "ambiguous" : "unresolved";
      let product: { id: string; label: string } | null = null;
      if (targets.size === 1 && !targets.has("unresolved")) {
        const row = await this.db
          .collection("products")
          .findOne({
            ...scope,
            _id: new ObjectId([...targets][0]),
            active: true,
          });
        if (row) {
          product = {
            id: row._id.toHexString(),
            label: z.string().parse(row.label),
          };
          method = "identifier";
        }
      } else if (!keys.length) {
        // An unrecognized identifier must not be silently overridden by a label.
        const label = fields.find((f) => f.key === "product_label")?.value;
        const candidates =
          typeof label === "string"
            ? await this.db
                .collection("products")
                .find({
                  ...scope,
                  normalizedLabel: normalizeExternalKey(label),
                  active: true,
                })
                .limit(2)
                .toArray()
            : [];
        if (candidates.length === 1) {
          product = {
            id: candidates[0]!._id.toHexString(),
            label: z.string().parse(candidates[0]!.label),
          };
          method = "label";
        } else if (candidates.length > 1) method = "ambiguous";
      }
      matches.push(briefMatchSchema.parse({ section, method, product }));
    }
    await this.source(scope, brief.sourceId);
    return matches;
  }
  async review(
    context: AuthorizedStoreContext,
    sourceId: string,
    raw: unknown,
  ) {
    const scope = scopeOf(context, "imports.commit");
    const request = briefReviewSchema.parse(raw);
    return this.transaction(async (session) => {
      await this.authorize(scope, context.userId, "imports.commit", session);
      const source = await this.source(scope, sourceId, session, true);
      const rawJob = await this.jobs.findOne(
        {
          ...scope,
          sourceId,
          checksumSha256: source.checksumSha256,
          expiresAtDate: { $gt: this.now() },
        },
        { session },
      );
      if (!rawJob) throw deny();
      const job = storedSchema.parse(rawJob);
      const section = job.extraction?.sections[request.section];
      if (
        !section ||
        job.state !== "draft" ||
        job.revision !== request.expectedRevision ||
        job.reviews.some((r) => r.section === request.section)
      )
        throw conflict(
          "Brouillon modifié ou déjà relu. Actualisez avant de continuer.",
        );
      if (request.decision === "confirmed") {
        if (
          request.values.length !== section.fields.length ||
          request.values.some((f, i) => f.key !== section.fields[i]!.key)
        )
          throw conflict("Les champs source doivent être conservés");
        validateBriefValues(request.values);
      } else if (request.values.length)
        throw conflict("Une exclusion ne remplace pas les valeurs source");
      job.reviews.push({
        section: request.section,
        decision: request.decision,
        values: request.values,
        actorId: context.userId,
        reviewedAt: this.now().toISOString(),
      });
      job.revision++;
      job.state =
        job.reviews.length === job.extraction!.sections.length
          ? "reviewed"
          : "draft";
      await this.jobs.replaceOne(
        { ...scope, _id: job._id, revision: request.expectedRevision },
        job,
        { session },
      );
      await this.audit(
        scope,
        job,
        context.userId,
        "commercial_brief.transcription_reviewed",
        session,
      );
      return present(job);
    });
  }
  async claim(scopeInput: { organizationId: string; storeId: string }) {
    const scope = {
      organizationId: z.string().min(1).parse(scopeInput.organizationId),
      storeId: new ObjectId(documentSourceIdSchema.parse(scopeInput.storeId)),
    };
    // A dead worker is NEVER retried automatically: provider billing is uncertain.
    await this.jobs.updateMany(
      { ...scope, state: "running", leaseUntil: { $lte: this.now() } },
      {
        $set: { state: "failed", error: "interrupted" },
        $unset: { leaseUntil: "" },
      },
    );
    const raw = await this.jobs.findOneAndUpdate(
      { ...scope, state: "queued", expiresAtDate: { $gt: this.now() } },
      {
        $set: {
          state: "running",
          leaseUntil: new Date(this.now().getTime() + briefPolicy.leaseMs),
        },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );
    return raw ? storedSchema.parse(raw) : null;
  }
  async workerSource(job: StoredBrief) {
    const scope = { organizationId: job.organizationId, storeId: job.storeId };
    await this.authorize(scope, job.ownerId, "imports.create");
    await this.source(
      scope,
      job.sourceId,
      undefined,
      false,
      job.checksumSha256,
    );
  }
  async complete(
    job: StoredBrief,
    result: { extraction: unknown; usage: unknown; responseModel: string },
  ) {
    const scope = { organizationId: job.organizationId, storeId: job.storeId };
    const usage = result.usage ? briefUsageSchema.parse(result.usage) : null;
    let extraction: BriefStatus["extraction"] = null;
    try {
      extraction = validateBriefExtraction(result.extraction, job.pages);
    } catch {
      /* reject non-grounded output, keep usage */
    }
    return this.transaction(async (session) => {
      await this.authorize(scope, job.ownerId, "imports.create", session);
      await this.source(scope, job.sourceId, session, true, job.checksumSha256);
      const saved = await this.jobs.updateOne(
        {
          ...scope,
          _id: job._id,
          state: "running",
          leaseUntil: { $gt: this.now() },
          expiresAtDate: { $gt: this.now() },
        },
        {
          $set: {
            extraction,
            usage,
            responseModel: z.string().max(120).parse(result.responseModel),
            state: extraction ? "draft" : "failed",
            error: extraction ? null : "invalid_extraction",
          },
          $unset: { leaseUntil: "" },
        },
        { session },
      );
      if (saved.modifiedCount)
        await this.audit(
          scope,
          job,
          job.ownerId,
          extraction
            ? "commercial_brief.draft_created"
            : "commercial_brief.failed",
          session,
        );
      return saved.modifiedCount === 1;
    });
  }
  async fail(
    job: StoredBrief,
    error: "provider_unavailable" | "source_unavailable",
  ) {
    await this.jobs.updateOne(
      {
        organizationId: job.organizationId,
        storeId: job.storeId,
        _id: job._id,
        state: "running",
      },
      { $set: { state: "failed", error }, $unset: { leaseUntil: "" } },
    );
  }
}
