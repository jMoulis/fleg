import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
} from "mongodb";

import {
  decisionRecordSchema,
  type DecisionRecord,
  type RecommendationDecisionInput,
} from "@/domain/decisions/schemas";
import {
  recommendationDraftSchema,
  type RecommendationDraft,
} from "@/domain/recommendations/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface RecommendationDocument
  extends Omit<RecommendationDraft, "id" | "storeId"> {
  storeId: ObjectId;
}

interface DecisionLogDocument {
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
): DecisionRecord {
  return decisionRecordSchema.parse({
    ...decision,
    id: decision._id.toHexString(),
    recommendationId: decision.recommendationId.toHexString(),
    storeId: decision.storeId.toHexString(),
    decidedAt: decision.decidedAt.toISOString(),
  });
}

export class DecisionRepository {
  private readonly recommendations;
  private readonly decisionLogs;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client: MongoClient,
  ) {
    this.recommendations =
      db.collection<RecommendationDocument>("recommendations");
    this.decisionLogs = db.collection<DecisionLogDocument>("decisionLogs");
    this.auditLogs = db.collection("auditLogs");
  }

  async recordRecommendationDecision(input: {
    context: AuthorizedStoreContext;
    recommendationId: string;
    decisionInput: RecommendationDecisionInput;
    requestId: string;
  }): Promise<DecisionRecord> {
    const { context, recommendationId, decisionInput, requestId } = input;
    const storeId = new ObjectId(context.storeId);
    const recommendationObjectId = new ObjectId(recommendationId);
    const existing = await this.decisionLogs.findOne({
      organizationId: context.organizationId,
      storeId,
      idempotencyKey: decisionInput.idempotencyKey,
    });

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

        const decidedAt = new Date();
        const recommendationSnapshot = toRecommendationSnapshot(recommendation);
        const inserted = await this.decisionLogs.insertOne(
          {
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
        const record = decisionRecordSchema.parse({
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
  ): Promise<DecisionRecord[]> {
    const decisions = await this.decisionLogs
      .find({
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      })
      .sort({ decidedAt: -1 })
      .limit(limit)
      .toArray();

    return decisions.map(toDecisionRecord);
  }
}
