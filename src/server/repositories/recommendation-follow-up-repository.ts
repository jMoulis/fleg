import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type ClientSession,
  type WithId,
} from "mongodb";

import {
  recommendationFollowUpSchema,
  type ObservedRecommendationOutcome,
  type RecommendationFollowUp,
  type RecommendationFollowUpCompleteInput,
  type RecommendationFollowUpScheduleInput,
} from "@/domain/decisions/follow-up-schemas";
import { calculateRecommendationOutcome } from "@/domain/decisions/outcomes";
import { buildRecommendationFollowUpScope } from "@/domain/decisions/store-scope";
import {
  recommendationDecisionRecordSchema,
  type RecommendationDecisionRecord,
} from "@/domain/decisions/schemas";
import type { RecommendationDraft } from "@/domain/recommendations/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface RecommendationDecisionDocument {
  entryType?: "recommendation";
  recommendationId: ObjectId;
  organizationId: string;
  storeId: ObjectId;
  actorUserId: string;
  decision: "accepted" | "modified" | "rejected" | "deferred";
  modifiedType: RecommendationDraft["type"] | null;
  rationale: string | null;
  recommendationSnapshot: RecommendationDraft & { id: string };
  idempotencyKey: string;
  decidedAt: Date;
}

interface RecommendationFollowUpDocument {
  organizationId: string;
  storeId: ObjectId;
  recommendationDecisionId: ObjectId;
  recommendationId: ObjectId;
  decisionSnapshot: RecommendationDecisionRecord;
  beforePeriodKey: string;
  afterPeriodKey: string;
  dueOn: string;
  status: "scheduled" | "completed";
  observedResult: ObservedRecommendationOutcome | null;
  interpretation: string | null;
  limitations: string[];
  scheduledBy: string;
  scheduledAt: Date;
  completedBy: string | null;
  completedAt: Date | null;
  version: number;
  updatedAt: Date;
}

interface RecommendationFollowUpCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  operation: "schedule" | "complete";
  followUpId: ObjectId;
  snapshot: RecommendationFollowUp;
  createdAt: Date;
}

interface SalesFactDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: ObjectId;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

export class RecommendationFollowUpNotFoundError extends Error {
  readonly code = "RECOMMENDATION_FOLLOW_UP_NOT_FOUND";

  constructor() {
    super("Suivi ou décision introuvable, ou accès refusé");
    this.name = "RecommendationFollowUpNotFoundError";
  }
}

export class RecommendationFollowUpConflictError extends Error {
  readonly code = "RECOMMENDATION_FOLLOW_UP_CONFLICT";

  constructor(message = "Le suivi a changé, rechargez le journal") {
    super(message);
    this.name = "RecommendationFollowUpConflictError";
  }
}

export class RecommendationOutcomeUnavailableError extends Error {
  readonly code = "RECOMMENDATION_OUTCOME_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "RecommendationOutcomeUnavailableError";
  }
}

export class InvalidRecommendationFollowUpError extends Error {
  readonly code = "INVALID_RECOMMENDATION_FOLLOW_UP";

  constructor(message: string) {
    super(message);
    this.name = "InvalidRecommendationFollowUpError";
  }
}

function toDecisionSnapshot(
  document: WithId<RecommendationDecisionDocument>,
): RecommendationDecisionRecord {
  return recommendationDecisionRecordSchema.parse({
    ...document,
    entryType: "recommendation",
    id: document._id.toHexString(),
    recommendationId: document.recommendationId.toHexString(),
    storeId: document.storeId.toHexString(),
    decidedAt: document.decidedAt.toISOString(),
  });
}

function toFollowUp(
  document: WithId<RecommendationFollowUpDocument>,
): RecommendationFollowUp {
  return recommendationFollowUpSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    recommendationDecisionId: document.recommendationDecisionId.toHexString(),
    recommendationId: document.recommendationId.toHexString(),
    scheduledAt: document.scheduledAt.toISOString(),
    completedAt: document.completedAt?.toISOString() ?? null,
    updatedAt: document.updatedAt.toISOString(),
  });
}

export class RecommendationFollowUpRepository {
  private readonly decisionLogs;
  private readonly followUps;
  private readonly commands;
  private readonly salesFacts;
  private readonly stores;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.decisionLogs =
      db.collection<RecommendationDecisionDocument>("decisionLogs");
    this.followUps = db.collection<RecommendationFollowUpDocument>(
      "recommendationFollowUps",
    );
    this.commands = db.collection<RecommendationFollowUpCommandDocument>(
      "recommendationFollowUpCommands",
    );
    this.salesFacts = db.collection<SalesFactDocument>("salesFacts");
    this.stores = db.collection<{ organizationId: string; dataRevision: number }>(
      "stores",
    );
    this.auditLogs = db.collection("auditLogs");
  }

  async listForStore(
    context: AuthorizedStoreContext,
  ): Promise<RecommendationFollowUp[]> {
    const scope = buildRecommendationFollowUpScope(context);
    const documents = await this.followUps
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
      })
      .sort({ updatedAt: -1 })
      .limit(500)
      .toArray();

    return documents.map(toFollowUp);
  }

  async schedule(input: {
    context: AuthorizedStoreContext;
    decisionId: string;
    scheduleInput: RecommendationFollowUpScheduleInput;
    requestId: string;
  }): Promise<RecommendationFollowUp> {
    const { context, decisionId, scheduleInput, requestId } = input;
    const duplicate = await this.findCommand(
      context,
      scheduleInput.idempotencyKey,
    );
    if (duplicate) {
      if (
        duplicate.operation !== "schedule" ||
        duplicate.snapshot.recommendationDecisionId !== decisionId
      ) {
        throw new RecommendationFollowUpConflictError(
          "Cette clé d’idempotence appartient à un autre suivi",
        );
      }
      return recommendationFollowUpSchema.parse(duplicate.snapshot);
    }
    if (!this.client) throw new Error("Client Mongo requis pour planifier un suivi");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const scope = buildRecommendationFollowUpScope(context);
        const storeId = new ObjectId(scope.storeId);
        const decisionObjectId = new ObjectId(decisionId);
        const decisionDocument = await this.decisionLogs.findOne(
          {
            _id: decisionObjectId,
            organizationId: scope.organizationId,
            storeId,
            $or: [
              { entryType: "recommendation" },
              { entryType: { $exists: false } },
            ],
            decision: { $in: ["accepted", "modified"] },
          },
          { session },
        );
        if (!decisionDocument) throw new RecommendationFollowUpNotFoundError();

        const decisionSnapshot = toDecisionSnapshot(decisionDocument);
        const beforePeriodKey =
          decisionSnapshot.recommendationSnapshot.periodKey;
        if (scheduleInput.afterPeriodKey <= beforePeriodKey) {
          throw new InvalidRecommendationFollowUpError(
            "La période après doit être postérieure à la période de la recommandation",
          );
        }
        if (scheduleInput.dueOn < `${scheduleInput.afterPeriodKey}-01`) {
          throw new InvalidRecommendationFollowUpError(
            "L’échéance ne peut pas précéder la période après",
          );
        }
        const alreadyScheduled = await this.followUps.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            recommendationDecisionId: decisionObjectId,
          },
          { projection: { _id: 1 }, session },
        );
        if (alreadyScheduled) {
          throw new RecommendationFollowUpConflictError(
            "Un suivi existe déjà pour cette décision",
          );
        }

        const now = new Date();
        const followUpId = new ObjectId();
        const followUp = recommendationFollowUpSchema.parse({
          id: followUpId.toHexString(),
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          recommendationDecisionId: decisionId,
          recommendationId: decisionSnapshot.recommendationId,
          decisionSnapshot,
          beforePeriodKey,
          afterPeriodKey: scheduleInput.afterPeriodKey,
          dueOn: scheduleInput.dueOn,
          status: "scheduled",
          observedResult: null,
          interpretation: null,
          limitations: [],
          scheduledBy: context.userId,
          scheduledAt: now.toISOString(),
          completedBy: null,
          completedAt: null,
          version: 1,
          updatedAt: now.toISOString(),
        });

        await this.followUps.insertOne(
          {
            _id: followUpId,
            organizationId: followUp.organizationId,
            storeId,
            recommendationDecisionId: decisionObjectId,
            recommendationId: new ObjectId(followUp.recommendationId),
            decisionSnapshot,
            beforePeriodKey,
            afterPeriodKey: followUp.afterPeriodKey,
            dueOn: followUp.dueOn,
            status: "scheduled",
            observedResult: null,
            interpretation: null,
            limitations: [],
            scheduledBy: context.userId,
            scheduledAt: now,
            completedBy: null,
            completedAt: null,
            version: 1,
            updatedAt: now,
          },
          { session },
        );
        await this.recordCommand({
          context,
          idempotencyKey: scheduleInput.idempotencyKey,
          operation: "schedule",
          followUpId,
          snapshot: followUp,
          now,
          session,
        });
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "recommendation_follow_up.scheduled",
            entityType: "recommendationFollowUp",
            entityId: followUpId,
            before: null,
            after: followUp,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        return followUp;
      });

      if (!result) throw new Error("Le suivi n’a pas été planifié");
      return result;
    } catch (error) {
      return this.handleDuplicateCommand(
        error,
        context,
        scheduleInput.idempotencyKey,
        { operation: "schedule", decisionId },
      );
    } finally {
      await session.endSession();
    }
  }

  async complete(input: {
    context: AuthorizedStoreContext;
    decisionId: string;
    followUpId: string;
    completeInput: RecommendationFollowUpCompleteInput;
    requestId: string;
  }): Promise<RecommendationFollowUp> {
    const { context, decisionId, followUpId, completeInput, requestId } = input;
    const duplicate = await this.findCommand(
      context,
      completeInput.idempotencyKey,
    );
    if (duplicate) {
      if (
        duplicate.operation !== "complete" ||
        duplicate.snapshot.recommendationDecisionId !== decisionId ||
        duplicate.followUpId.toHexString() !== followUpId
      ) {
        throw new RecommendationFollowUpConflictError(
          "Cette clé d’idempotence appartient à un autre suivi",
        );
      }
      return recommendationFollowUpSchema.parse(duplicate.snapshot);
    }
    if (!this.client) throw new Error("Client Mongo requis pour clôturer un suivi");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const scope = buildRecommendationFollowUpScope(context);
        const storeId = new ObjectId(scope.storeId);
        const followUpObjectId = new ObjectId(followUpId);
        const currentDocument = await this.followUps.findOne(
          {
            _id: followUpObjectId,
            organizationId: scope.organizationId,
            storeId,
            recommendationDecisionId: new ObjectId(decisionId),
          },
          { session },
        );
        if (!currentDocument) throw new RecommendationFollowUpNotFoundError();
        const current = toFollowUp(currentDocument);
        if (
          current.status !== "scheduled" ||
          current.version !== completeInput.basedOnVersion
        ) {
          throw new RecommendationFollowUpConflictError();
        }

        const [afterFact, store] = await Promise.all([
          this.salesFacts.findOne(
            {
              organizationId: scope.organizationId,
              storeId,
              productId: new ObjectId(
                current.decisionSnapshot.recommendationSnapshot.productId,
              ),
              periodKey: current.afterPeriodKey,
            },
            { session },
          ),
          this.stores.findOne(
            { _id: storeId, organizationId: scope.organizationId, active: true },
            { projection: { dataRevision: 1 }, session },
          ),
        ]);
        if (!afterFact || !store) {
          throw new RecommendationOutcomeUnavailableError(
            `Aucune donnée observée n’est disponible pour ${current.afterPeriodKey}`,
          );
        }

        const now = new Date();
        const beforeInput = current.decisionSnapshot.recommendationSnapshot.inputs;
        const outcome = calculateRecommendationOutcome({
          before: {
            periodKey: current.beforePeriodKey,
            revenueCents: beforeInput.revenueCents,
            marginCents: beforeInput.marginCents,
            quantity: beforeInput.quantity,
            dataRevision:
              current.decisionSnapshot.recommendationSnapshot.inputRevision,
            source: "recommendation_snapshot",
          },
          after: {
            periodKey: current.afterPeriodKey,
            revenueCents: afterFact.revenueCents,
            marginCents: afterFact.marginCents,
            quantity: afterFact.quantity,
            dataRevision: store.dataRevision,
            source: "salesFacts",
          },
          calculatedAt: now.toISOString(),
        });
        const limitations = [
          ...new Set([...outcome.limitations, ...completeInput.limitations]),
        ].slice(0, 12);
        const completed = recommendationFollowUpSchema.parse({
          ...current,
          status: "completed",
          observedResult: outcome.observedResult,
          interpretation: completeInput.interpretation,
          limitations,
          completedBy: context.userId,
          completedAt: now.toISOString(),
          version: current.version + 1,
          updatedAt: now.toISOString(),
        });

        const updateResult = await this.followUps.updateOne(
          {
            _id: followUpObjectId,
            organizationId: scope.organizationId,
            storeId,
            status: "scheduled",
            version: current.version,
          },
          {
            $set: {
              status: "completed",
              observedResult: outcome.observedResult,
              interpretation: completed.interpretation,
              limitations,
              completedBy: context.userId,
              completedAt: now,
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (updateResult.modifiedCount !== 1) {
          throw new RecommendationFollowUpConflictError();
        }
        await this.recordCommand({
          context,
          idempotencyKey: completeInput.idempotencyKey,
          operation: "complete",
          followUpId: followUpObjectId,
          snapshot: completed,
          now,
          session,
        });
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "recommendation_follow_up.completed",
            entityType: "recommendationFollowUp",
            entityId: followUpObjectId,
            before: current,
            after: completed,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        return completed;
      });

      if (!result) throw new Error("Le résultat n’a pas été enregistré");
      return result;
    } catch (error) {
      return this.handleDuplicateCommand(
        error,
        context,
        completeInput.idempotencyKey,
        { operation: "complete", decisionId, followUpId },
      );
    } finally {
      await session.endSession();
    }
  }

  private async findCommand(
    context: AuthorizedStoreContext,
    idempotencyKey: string,
  ) {
    const scope = buildRecommendationFollowUpScope(context);
    return this.commands.findOne({
      organizationId: scope.organizationId,
      storeId: new ObjectId(scope.storeId),
      idempotencyKey,
    });
  }

  private async recordCommand(input: {
    context: AuthorizedStoreContext;
    idempotencyKey: string;
    operation: "schedule" | "complete";
    followUpId: ObjectId;
    snapshot: RecommendationFollowUp;
    now: Date;
    session: ClientSession;
  }) {
    const scope = buildRecommendationFollowUpScope(input.context);
    await this.commands.insertOne(
      {
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        idempotencyKey: input.idempotencyKey,
        operation: input.operation,
        followUpId: input.followUpId,
        snapshot: input.snapshot,
        createdAt: input.now,
      },
      { session: input.session },
    );
  }

  private async handleDuplicateCommand(
    error: unknown,
    context: AuthorizedStoreContext,
    idempotencyKey: string,
    expected: {
      operation: "schedule" | "complete";
      decisionId: string;
      followUpId?: string;
    },
  ): Promise<RecommendationFollowUp> {
    if (error instanceof MongoServerError && error.code === 11000) {
      const duplicate = await this.findCommand(context, idempotencyKey);
      if (duplicate) {
        const sameTarget =
          duplicate.operation === expected.operation &&
          duplicate.snapshot.recommendationDecisionId ===
            expected.decisionId &&
          (expected.followUpId === undefined ||
            duplicate.followUpId.toHexString() === expected.followUpId);
        if (!sameTarget) {
          throw new RecommendationFollowUpConflictError(
            "Cette clé d’idempotence appartient à un autre suivi",
          );
        }
        return recommendationFollowUpSchema.parse(duplicate.snapshot);
      }
      throw new RecommendationFollowUpConflictError(
        "Un suivi existe déjà pour cette décision",
      );
    }
    throw error;
  }
}
