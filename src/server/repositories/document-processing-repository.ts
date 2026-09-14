import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  ObjectId,
  type ClientSession,
  type Db,
  type MongoClient,
} from "mongodb";
import { z } from "zod";
import { documentSourceIdSchema } from "@/domain/attachments/document-source";
import {
  checksumSchema,
  PrivateStorageError,
  privateBlobReferenceSchema,
} from "@/domain/attachments/private-storage";
import {
  documentProcessingPolicy as policy,
  extractedPagesSchema,
  processingErrorSchema,
  processingStateSchema,
  processingStatusSchema,
  type ExtractedPages,
} from "@/domain/attachments/document-processing";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { authorizeUploadAuthor } from "@/server/auth/upload-author-context";
import { pdfValidationSchema } from "@/server/storage/pdf-validator";

const jobSchema = z.object({
  _id: z.string().regex(/^[a-f0-9]{64}$/),
  organizationId: z.string().min(1).max(128),
  storeId: z.instanceof(ObjectId),
  sourceId: z.instanceof(ObjectId),
  ownerId: z.string().min(1).max(128),
  checksumSha256: checksumSchema,
  policyVersion: z.literal(policy.version),
  state: processingStateSchema,
  attempts: z.number().int().min(0).max(policy.maxAttempts),
  checkpoint: z.enum(["queued", "validated", "extracted"]),
  error: processingErrorSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date(),
  nextAttemptAt: z.date(),
  lease: z.object({ token: z.uuid(), until: z.date() }).optional(),
  result: extractedPagesSchema.optional(),
  history: z
    .array(
      z.object({
        attempt: z.number().int().min(1).max(policy.maxAttempts),
        startedAt: z.date(),
        extractorVersion: z.literal("pdfium-2.1.13-text-1"),
        providerSpendCents: z.literal(0),
        error: processingErrorSchema.nullable(),
        finishedAt: z.date().optional(),
      }),
    )
    .max(policy.maxAttempts),
});
type Job = z.infer<typeof jobSchema>;
const sourceSchema = z.object({
  _id: z.instanceof(ObjectId),
  checksumSha256: checksumSchema,
  mimeType: z.literal("application/pdf"),
  storageState: z.literal("linked"),
  storage: privateBlobReferenceSchema,
  verification: pdfValidationSchema.extend({ verifiedAt: z.date() }),
});
type Scope = { organizationId: string; storeId: ObjectId };
type Lane = Scope & {
  _id: string;
  revision: number;
  token?: string;
  until?: Date;
};
const unavailable = () =>
  new PrivateStorageError(
    "UPLOAD_NOT_FOUND",
    "Document introuvable ou accès refusé",
  );
const conflict = () =>
  new PrivateStorageError(
    "UPLOAD_CONFLICT",
    "Traitement indisponible dans les limites autorisées",
  );
function scopeOf(context: AuthorizedStoreContext, write = false): Scope {
  if (
    !context.permissions.includes(write ? "attachments.write" : "stores.read")
  )
    throw new StoreAccessDeniedError();
  return {
    organizationId: context.organizationId,
    storeId: new ObjectId(context.storeId),
  };
}
function present(job: Job) {
  return processingStatusSchema.parse({
    sourceId: job.sourceId.toHexString(),
    checksumSha256: job.checksumSha256,
    policyVersion: job.policyVersion,
    state: job.state,
    attempts: job.attempts,
    checkpoint: job.checkpoint,
    error: job.error,
    expiresAt: job.expiresAt.toISOString(),
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    result: job.state === "ready" ? (job.result ?? null) : null,
    reviewState: "unreviewed",
    indexing: "not_requested",
    providerSpendCents: 0,
  });
}

export class DocumentProcessingRepository {
  private jobs;
  private lanes;
  constructor(
    private db: Db,
    private authDb: Db,
    private client: MongoClient,
    private now = () => new Date(),
  ) {
    this.jobs = db.collection<Job>("documentProcessingJobs");
    this.lanes = db.collection<Lane>("documentProcessingLanes");
  }
  private async transaction<T>(fn: (session: ClientSession) => Promise<T>) {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(() => fn(session));
    } finally {
      await session.endSession();
    }
  }
  private async authorize(
    scope: Scope,
    ownerId: string,
    session?: ClientSession,
  ) {
    return authorizeUploadAuthor({
      db: this.db,
      authDb: this.authDb,
      ...scope,
      ownerId,
      session,
    });
  }
  private async source(
    scope: Scope,
    sourceId: ObjectId,
    checksum?: string,
    session?: ClientSession,
    fence = false,
  ) {
    const filter = {
      ...scope,
      _id: sourceId,
      storageState: "linked",
      ...(checksum ? { checksumSha256: checksum } : {}),
    };
    const raw = fence
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
    if (!raw) throw unavailable();
    return sourceSchema.parse(raw);
  }
  private async audit(
    scope: Scope,
    sourceId: ObjectId,
    actorId: string,
    action: string,
    session: ClientSession,
  ) {
    const now = this.now();
    await this.db
      .collection("auditLogs")
      .insertOne(
        {
          ...scope,
          actorId,
          action,
          entityType: "documentProcessing",
          entityId: sourceId,
          requestId: randomUUID(),
          createdAt: now,
          timestamp: now,
        },
        { session },
      );
  }
  async enqueue(context: AuthorizedStoreContext, rawId: unknown) {
    const scope = scopeOf(context, true);
    const sourceId = new ObjectId(documentSourceIdSchema.parse(rawId));
    return this.transaction(async (session) => {
      await this.authorize(scope, context.userId, session);
      const source = await this.source(
        scope,
        sourceId,
        undefined,
        session,
        true,
      );
      const id = createHash("sha256")
        .update(
          JSON.stringify([
            scope.organizationId,
            context.storeId,
            sourceId.toHexString(),
            source.checksumSha256,
            policy.version,
          ]),
        )
        .digest("hex");
      const current = await this.jobs.findOne(
        { ...scope, _id: id },
        { session },
      );
      if (current) {
        if (current.expiresAt <= this.now()) throw conflict();
        return present(jobSchema.parse(current));
      }
      const laneId = `${scope.organizationId}/${context.storeId}`;
      // Serialize admission for the entire store; concurrent documents cannot exceed the cap.
      await this.lanes.updateOne(
        { ...scope, _id: laneId },
        { $inc: { revision: 1 }, $setOnInsert: scope },
        { upsert: true, session },
      );
      if (
        (await this.jobs.countDocuments(scope, { session })) >=
        policy.maxJobsPerStore
      )
        throw conflict();
      const now = this.now();
      const job = jobSchema.parse({
        _id: id,
        ...scope,
        sourceId,
        ownerId: context.userId,
        checksumSha256: source.checksumSha256,
        policyVersion: policy.version,
        state: "queued",
        attempts: 0,
        checkpoint: "queued",
        error: null,
        history: [],
        createdAt: now,
        updatedAt: now,
        nextAttemptAt: now,
        expiresAt: new Date(now.getTime() + policy.retentionMs),
      });
      await this.jobs.insertOne(job, { session });
      await this.audit(
        scope,
        sourceId,
        context.userId,
        "document.processing_queued",
        session,
      );
      return present(job);
    });
  }
  async get(context: AuthorizedStoreContext, rawId: unknown) {
    const scope = scopeOf(context);
    const sourceId = new ObjectId(documentSourceIdSchema.parse(rawId));
    const source = await this.source(scope, sourceId);
    const job = await this.jobs.findOne({
      ...scope,
      sourceId,
      checksumSha256: source.checksumSha256,
      policyVersion: policy.version,
      expiresAt: { $gt: this.now() },
    });
    // A deletion concurrent with the read must never make its derived text visible.
    await this.source(scope, sourceId, source.checksumSha256);
    return job ? present(jobSchema.parse(job)) : null;
  }
  async cancel(context: AuthorizedStoreContext, rawId: unknown) {
    const scope = scopeOf(context, true);
    const sourceId = new ObjectId(documentSourceIdSchema.parse(rawId));
    await this.transaction(async (session) => {
      await this.authorize(scope, context.userId, session);
      await this.source(scope, sourceId, undefined, session, true);
      const result = await this.jobs.updateMany(
        { ...scope, sourceId, state: { $ne: "cancelled" } },
        {
          $set: { state: "cancelled", updatedAt: this.now(), error: null },
          $unset: { result: "", lease: "" },
        },
        { session },
      );
      if (result.modifiedCount)
        await this.audit(
          scope,
          sourceId,
          context.userId,
          "document.processing_cancelled",
          session,
        );
    });
    return this.get(context, rawId);
  }
  // Service scope is injected from the server allowlist, never HTTP/body/model input.
  async claim(rawScope: { organizationId: string; storeId: string }) {
    const scope = {
      organizationId: z.string().min(1).max(128).parse(rawScope.organizationId),
      storeId: new ObjectId(documentSourceIdSchema.parse(rawScope.storeId)),
    };
    return this.transaction(async (session) => {
      const now = this.now();
      const id = `${scope.organizationId}/${scope.storeId.toHexString()}`;
      const lane = await this.lanes.findOne({ ...scope, _id: id }, { session });
      if (!lane || (lane.until && lane.until > now)) return null;
      // Expired last attempts are terminal even when the worker died before recording an error.
      await this.jobs.updateMany(
        {
          ...scope,
          state: "running",
          "lease.until": { $lte: now },
          attempts: { $gte: policy.maxAttempts },
        },
        {
          $set: { state: "failed", error: "budget_exhausted", updatedAt: now },
          $unset: { lease: "", result: "" },
        },
        { session },
      );
      const job = await this.jobs.findOne(
        {
          ...scope,
          policyVersion: policy.version,
          expiresAt: { $gt: now },
          attempts: { $lt: policy.maxAttempts },
          $or: [
            { state: "queued", nextAttemptAt: { $lte: now } },
            { state: "running", "lease.until": { $lte: now } },
          ],
        },
        { session, sort: { createdAt: 1 } },
      );
      if (!job) return null;
      const lease = {
        token: randomUUID(),
        until: new Date(now.getTime() + policy.leaseMs),
      };
      await this.lanes.updateOne(
        { ...scope, _id: id },
        {
          $set: { token: lease.token, until: lease.until },
          $inc: { revision: 1 },
        },
        { session },
      );
      const claimed = await this.jobs.findOneAndUpdate(
        { ...scope, _id: job._id },
        {
          $inc: { attempts: 1 },
          $set: { state: "running", lease, updatedAt: now, error: null },
          $push: {
            history: {
              attempt: job.attempts + 1,
              startedAt: now,
              extractorVersion: "pdfium-2.1.13-text-1",
              providerSpendCents: 0,
              error: null,
            },
          },
        },
        { session, returnDocument: "after" },
      );
      return jobSchema.parse(claimed);
    });
  }
  async workerContext(job: Job) {
    const scope = { organizationId: job.organizationId, storeId: job.storeId };
    const context = await this.authorize(scope, job.ownerId);
    await this.source(scope, job.sourceId, job.checksumSha256);
    return context;
  }
  async checkpoint(job: Job) {
    return this.jobs.updateOne(this.leaseFilter(job), {
      $set: { checkpoint: "validated", updatedAt: this.now() },
    });
  }
  private leaseFilter(job: Job) {
    return {
      _id: job._id,
      organizationId: job.organizationId,
      storeId: job.storeId,
      state: "running" as const,
      "lease.token": job.lease?.token ?? "",
      "lease.until": { $gt: this.now() },
      expiresAt: { $gt: this.now() },
    };
  }
  async complete(job: Job, rawResult: unknown) {
    const result = extractedPagesSchema.parse(rawResult);
    return this.transaction(async (session) => {
      const scope = {
        organizationId: job.organizationId,
        storeId: job.storeId,
      };
      await this.authorize(scope, job.ownerId, session);
      const source = await this.source(
        scope,
        job.sourceId,
        job.checksumSha256,
        session,
        true,
      );
      if (source.verification.pageCount !== result.pages.length)
        throw new PrivateStorageError(
          "STORAGE_INTEGRITY",
          "Nombre de pages incohérent",
        );
      const updated = await this.jobs.updateOne(
        this.leaseFilter(job),
        {
          $set: {
            state: "ready",
            checkpoint: "extracted",
            result,
            updatedAt: this.now(),
            error: null,
            history: job.history.map((entry) =>
              entry.attempt === job.attempts
                ? { ...entry, finishedAt: this.now() }
                : entry,
            ),
          },
          $unset: { lease: "" },
        },
        { session },
      );
      if (updated.modifiedCount)
        await this.audit(
          scope,
          job.sourceId,
          job.ownerId,
          "document.processing_ready",
          session,
        );
      return updated.modifiedCount === 1;
    });
  }
  async fail(job: Job, error: z.infer<typeof processingErrorSchema>) {
    const code = processingErrorSchema.parse(error);
    const retry = code === "temporary" && job.attempts < policy.maxAttempts;
    await this.jobs.updateOne(this.leaseFilter(job), {
      $set: {
        state:
          code === "source_unavailable"
            ? "cancelled"
            : retry
              ? "queued"
              : "failed",
        error: code,
        history: job.history.map((entry) =>
          entry.attempt === job.attempts
            ? { ...entry, error: code, finishedAt: this.now() }
            : entry,
        ),
        updatedAt: this.now(),
        nextAttemptAt: new Date(
          this.now().getTime() + policy.retryMs * job.attempts,
        ),
      },
      $unset: { lease: "", result: "" },
    });
  }
  async release(job: Job) {
    await this.lanes.updateOne(
      {
        _id: `${job.organizationId}/${job.storeId.toHexString()}`,
        organizationId: job.organizationId,
        storeId: job.storeId,
        token: job.lease?.token,
      },
      { $unset: { token: "", until: "" } },
    );
  }
}

export async function processOneDocument(input: {
  repository: DocumentProcessingRepository;
  scope: { organizationId: string; storeId: string };
  read: (
    context: AuthorizedStoreContext,
    sourceId: string,
  ) => Promise<Uint8Array>;
  extract: (bytes: Uint8Array) => Promise<ExtractedPages>;
}) {
  const job = await input.repository.claim(input.scope);
  if (!job) return { processed: false };
  try {
    const context = await input.repository.workerContext(job);
    const bytes = await input.read(context, job.sourceId.toHexString());
    if (
      bytes.length > 25 * 1024 * 1024 ||
      createHash("sha256").update(bytes).digest("hex") !== job.checksumSha256
    )
      throw new PrivateStorageError("STORAGE_INTEGRITY", "Source modifiée");
    if (!(await input.repository.checkpoint(job)).matchedCount)
      return { processed: true, outcome: "superseded" };
    const result = await input.extract(bytes);
    const ready = await input.repository.complete(job, result);
    return { processed: true, outcome: ready ? "ready" : "superseded" };
  } catch (error) {
    const code =
      error instanceof StoreAccessDeniedError ||
      (error instanceof PrivateStorageError &&
        error.code === "UPLOAD_NOT_FOUND")
        ? "source_unavailable"
        : error instanceof PrivateStorageError &&
            error.code === "STORAGE_INTEGRITY"
          ? "invalid_pdf"
          : error instanceof z.ZodError
            ? "invalid_pdf"
            : "temporary";
    await input.repository.fail(job, code);
    return { processed: true, outcome: code };
  } finally {
    await input.repository.release(job);
  }
}
