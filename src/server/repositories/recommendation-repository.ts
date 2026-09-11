import "server-only";

import { Db, ObjectId } from "mongodb";

import {
  defaultRecommendationConfig,
  recommendationConfigSchema,
  recommendationDraftSchema,
  type RecommendationConfig,
  type RecommendationDraft,
} from "@/domain/recommendations/schemas";
import { configVersion } from "@/domain/configuration/versions";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { recommendationExpiry } from "@/server/db/recommendation-retention";

interface RecommendationDocument
  extends Omit<RecommendationDraft, "id" | "storeId"> {
  storeId: ObjectId;
  retention?: "cache" | "evidence";
  expiresAt?: Date;
}

function toRecommendation(
  document: RecommendationDocument & { _id: ObjectId },
): RecommendationDraft & { id: string } {
  return recommendationDraftSchema.required({ id: true }).parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
  });
}

export class RecommendationRepository {
  private readonly recommendations;
  private readonly recommendationRuns;
  private readonly storeSettings;

  constructor(db: Db) {
    this.recommendations =
      db.collection<RecommendationDocument>("recommendations");
    this.recommendationRuns = db.collection("recommendationRuns");
    this.storeSettings = db.collection<{
      revision?: number;
      recommendations?: Record<string, unknown>;
    }>("storeSettings");
  }

  async getConfig(
    context: AuthorizedStoreContext,
  ): Promise<RecommendationConfig> {
    const settings = await this.storeSettings.findOne(
      {
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      },
      { projection: { recommendations: 1, revision: 1 } },
    );

    const config = recommendationConfigSchema.parse({
      ...defaultRecommendationConfig,
      ...(settings?.recommendations ?? {}),
    });
    return {
      ...config,
      modelVersion: configVersion(
        defaultRecommendationConfig.modelVersion,
        settings?.revision,
      ),
    };
  }

  async findRun(input: {
    context: AuthorizedStoreContext;
    periodKey: string;
    inputRevision: number;
    calculationVersion: string;
    modelVersion: string;
  }): Promise<Array<RecommendationDraft & { id: string }> | null> {
    const { context } = input;
    const filter = {
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      periodKey: input.periodKey,
      inputRevision: input.inputRevision,
      modelVersion: input.modelVersion,
      calculationVersion: input.calculationVersion,
    };
    const run = await this.recommendationRuns.findOne(filter);
    if (!run) return null;
    const documents = await this.recommendations
      .find(filter)
      .sort({ productLabel: 1 })
      .toArray();
    // TTL can delete a subset while a run marker still exists. Rebuild a partial
    // cache rather than returning a silently incomplete catalogue.
    if (documents.length !== run.recommendationCount) return null;
    return documents.map(toRecommendation);
  }

  async saveRun(input: {
    context: AuthorizedStoreContext;
    periodKey: string;
    inputRevision: number;
    calculationVersion: string;
    modelVersion: string;
    generatedAt: string;
    drafts: RecommendationDraft[];
  }): Promise<Array<RecommendationDraft & { id: string }>> {
    const {
      context,
      periodKey,
      inputRevision,
      calculationVersion,
      modelVersion,
      generatedAt,
      drafts,
    } = input;
    const storeId = new ObjectId(context.storeId);
    const expiry = recommendationExpiry(new Date(generatedAt));

    if (drafts.length > 0) {
      await this.recommendations.bulkWrite(
        drafts.map((draft) => ({
          updateOne: {
            filter: {
              organizationId: context.organizationId,
              storeId,
              periodKey,
              productId: draft.productId,
              inputRevision,
              modelVersion,
            },
            update: {
              $setOnInsert: {
                ...draft,
                storeId,
                retention: "cache",
                expiresAt: expiry.current,
              },
            },
            upsert: true,
          },
        })),
      );
    }

    await this.recommendationRuns.updateOne(
      {
        organizationId: context.organizationId,
        storeId,
        periodKey,
        inputRevision,
        calculationVersion,
        modelVersion,
      },
      {
        $setOnInsert: {
          organizationId: context.organizationId,
          storeId,
          periodKey,
          inputRevision,
          calculationVersion,
          modelVersion,
          generatedAt,
          recommendationCount: drafts.length,
        },
        $set: { expiresAt: expiry.current },
      },
      { upsert: true },
    );

    // Never target legacy or pinned evidence. Old documents are handled by an
    // explicit, backed-up maintenance operation, not an implicit deployment purge.
    await this.recommendations.updateMany(
      {
        organizationId: context.organizationId,
        storeId,
        periodKey,
        retention: "cache",
        $or: [
          { inputRevision: { $lt: inputRevision } },
          {
            inputRevision,
            modelVersion: { $ne: modelVersion },
            generatedAt: { $lt: generatedAt },
          },
        ],
      },
      { $min: { expiresAt: expiry.superseded } },
    );

    const documents = await this.recommendations
      .find({
        organizationId: context.organizationId,
        storeId,
        periodKey,
        inputRevision,
        modelVersion,
      })
      .sort({ productLabel: 1 })
      .toArray();

    return documents.map(toRecommendation);
  }
}
