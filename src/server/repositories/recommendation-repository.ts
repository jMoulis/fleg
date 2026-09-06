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

interface RecommendationDocument
  extends Omit<RecommendationDraft, "id" | "storeId"> {
  storeId: ObjectId;
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
      },
      { upsert: true },
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
