import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
} from "mongodb";

import {
  aiActionPlanDecisionRecordSchema,
  decisionLogEntrySchema,
  recommendationDecisionRecordSchema,
  type DecisionLogEntry,
  type RecommendationDecisionRecord,
  type RecommendationDecisionInput,
} from "@/domain/decisions/schemas";
import {
  recommendationDraftSchema,
  type RecommendationDraft,
} from "@/domain/recommendations/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { retainRecommendationEvidence } from "@/server/db/recommendation-retention";

interface RecommendationDocument
  extends Omit<RecommendationDraft, "id" | "storeId"> {
  storeId: ObjectId;
}

interface DecisionLogDocument {
  entryType?: "recommendation";
  recommendationId: ObjectId;
  organizationId: string;
  storeId: ObjectId;
  actorUserId: string;
  decision: RecommendationDecisionInput["decision"];
  modifiedType: RecommendationDecisionInput["modifiedType"] | null;
  rationale: string | null;
  recommendationSnapshot: RecommendationDraft & { id: string };
  idempotencyKey: string;
  decidedAt: Date;
  createdAt: Date;
}

interface ExperimentDecisionLogDocument {
  entryType: "experiment_conclusion";
  conclusionId: ObjectId;
  experimentId: ObjectId;
  organizationId: string;
  storeId: ObjectId;
  actorUserId: string;
  managerVerdict: string;
  systemSuggestedVerdict: string;
  decision: string;
  rationale: string;
  reusableTags: string[];
  experimentSnapshot: unknown;
  analysisSnapshot: unknown;
  idempotencyKey: string;
  decidedAt: Date;
  createdAt: Date;
}

interface AiActionPlanDecisionLogDocument {
  entryType: "ai_action_plan";
  actionPlanId: ObjectId;
  organizationId: string;
  storeId: ObjectId;
  actorUserId: string;
  decision: "approved" | "rejected";
  rationale: string;
  actionPlanSnapshot: unknown;
  idempotencyKey: string;
  decidedAt: Date;
  createdAt: Date;
}

type AnyDecisionLogDocument =
  | DecisionLogDocument
  | ExperimentDecisionLogDocument
  | AiActionPlanDecisionLogDocument;

function toRecommendationSnapshot(
  recommendation: RecommendationDocument & { _id: ObjectId },
) {
  return recommendationDraftSchema.required({ id: true }).parse({
    ...recommendation,
    id: recommendation._id.toHexString(),
    storeId: recommendation.storeId.toHexString(),
  });
}

function toDecisionRecord(
  decision: DecisionLogDocument & { _id: ObjectId },
): RecommendationDecisionRecord {
  return recommendationDecisionRecordSchema.parse({
    ...decision,
    entryType: "recommendation",
    id: decision._id.toHexString(),
    recommendationId: decision.recommendationId.toHexString(),
    storeId: decision.storeId.toHexString(),
    decidedAt: decision.decidedAt.toISOString(),
  });
}

function toDecisionLogEntry(
  decision: AnyDecisionLogDocument & { _id: ObjectId },
): DecisionLogEntry {
  if (decision.entryType === "experiment_conclusion") {
    return decisionLogEntrySchema.parse({
      ...decision,
      id: decision._id.toHexString(),
      conclusionId: decision.conclusionId.toHexString(),
      experimentId: decision.experimentId.toHexString(),
      storeId: decision.storeId.toHexString(),
      decidedAt: decision.decidedAt.toISOString(),
    });
  }
  if (decision.entryType === "ai_action_plan") {
    return aiActionPlanDecisionRecordSchema.parse({
      ...decision,
      id: decision._id.toHexString(),
      actionPlanId: decision.actionPlanId.toHexString(),
      storeId: decision.storeId.toHexString(),
      decidedAt: decision.decidedAt.toISOString(),
    });
  }
  return toDecisionRecord(decision);
}

export class DecisionRepository {
  private readonly recommendations;
  private readonly decisionLogs;
  private readonly auditLogs;

  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
  ) {
    this.recommendations =
      db.collection<RecommendationDocument>("recommendations");
    this.decisionLogs =
      db.collection<AnyDecisionLogDocument>("decisionLogs");
    this.auditLogs = db.collection("auditLogs");
  }

  async recordRecommendationDecision(input: {
    context: AuthorizedStoreContext;
    recommendationId: string;
    decisionInput: RecommendationDecisionInput;
    requestId: string;
  }): Promise<RecommendationDecisionRecord> {
    const { context, recommendationId, decisionInput, requestId } = input;
    const storeId = new ObjectId(context.storeId);
    const recommendationObjectId = new ObjectId(recommendationId);
    const existing = await this.decisionLogs.findOne({
      organizationId: context.organizationId,
      storeId,
      idempotencyKey: decisionInput.idempotencyKey,
    });

    if (
      existing?.entryType === "experiment_conclusion" ||
      existing?.entryType === "ai_action_plan"
    ) {
      throw new Error("Cette clé d’idempotence appartient à une autre décision");
    }
    if (existing) {
      return toDecisionRecord(existing);
    }

    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const recommendation = await this.recommendations.findOne(
          {
            _id: recommendationObjectId,
            organizationId: context.organizationId,
            storeId,
            status: "draft",
          },
          { session },
        );

        if (!recommendation) {
          throw new Error("Recommandation introuvable ou accès refusé");
        }

        await retainRecommendationEvidence({ db: this.db, context, recommendationId: recommendationObjectId, session });

        const decidedAt = new Date();
        const recommendationSnapshot = toRecommendationSnapshot(recommendation);
        const inserted = await this.decisionLogs.insertOne(
          {
            entryType: "recommendation",
            recommendationId: recommendationObjectId,
            organizationId: context.organizationId,
            storeId,
            actorUserId: context.userId,
            decision: decisionInput.decision,
            modifiedType: decisionInput.modifiedType ?? null,
            rationale: decisionInput.rationale?.trim() || null,
            recommendationSnapshot,
            idempotencyKey: decisionInput.idempotencyKey,
            decidedAt,
            createdAt: decidedAt,
          },
          { session },
        );
        const record = recommendationDecisionRecordSchema.parse({
          entryType: "recommendation",
          id: inserted.insertedId.toHexString(),
          recommendationId,
          organizationId: context.organizationId,
          storeId: context.storeId,
          actorUserId: context.userId,
          decision: decisionInput.decision,
          modifiedType: decisionInput.modifiedType ?? null,
          rationale: decisionInput.rationale?.trim() || null,
          recommendationSnapshot,
          idempotencyKey: decisionInput.idempotencyKey,
          decidedAt: decidedAt.toISOString(),
        });

        await this.auditLogs.insertOne(
          {
            organizationId: context.organizationId,
            storeId,
            actorId: context.userId,
            action: "recommendation.decision",
            entityType: "recommendation",
            entityId: recommendationObjectId,
            before: recommendationSnapshot,
            after: {
              decision: decisionInput.decision,
              modifiedType: decisionInput.modifiedType ?? null,
              rationale: decisionInput.rationale?.trim() || null,
            },
            requestId,
            timestamp: decidedAt,
            createdAt: decidedAt,
          },
          { session },
        );

        return record;
      });

      if (!result) {
        throw new Error("La décision n’a pas été enregistrée");
      }

      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const duplicate = await this.decisionLogs.findOne({
          organizationId: context.organizationId,
          storeId,
          idempotencyKey: decisionInput.idempotencyKey,
        });
        if (
          duplicate?.entryType === "experiment_conclusion" ||
          duplicate?.entryType === "ai_action_plan"
        ) {
          throw new Error("Cette clé d’idempotence appartient à une autre décision");
        }
        if (duplicate) {
          return toDecisionRecord(duplicate);
        }
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  async listForStore(
    context: AuthorizedStoreContext,
    limit = 100,
  ): Promise<DecisionLogEntry[]> {
    const decisions = await this.decisionLogs
      .find({
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      })
      .sort({ decidedAt: -1 })
      .limit(limit)
      .toArray();

    return decisions.map(toDecisionLogEntry);
  }
}
