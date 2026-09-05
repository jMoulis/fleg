import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  defaultEvaluationEngineConfig,
  evaluationEngineConfigSchema,
  experimentAnalysisSchema,
  type EvaluationEngineConfig,
  type ExperimentAnalysis,
} from "@/domain/experiments/evaluation-schemas";
import { resolveExperimentStatus } from "@/domain/experiments/lifecycle";
import type { Experiment } from "@/domain/experiments/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { ExperimentConflictError } from "@/server/repositories/experiment-repository";

interface ExperimentAnalysisDocument
  extends Omit<
    ExperimentAnalysis,
    "id" | "storeId" | "experimentId" | "analyzedAt"
  > {
  storeId: ObjectId;
  experimentId: ObjectId;
  analyzedAt: Date;
}

interface ExperimentStatusDocument {
  organizationId: string;
  storeId: ObjectId;
  status: Experiment["status"];
  updatedAt: Date;
  analyzedAt: Date | null;
}

interface StoreSettingsDocument {
  organizationId: string;
  storeId: ObjectId;
  experiments?: {
    evaluation?: Record<string, unknown>;
  };
}

export class ExperimentEvaluationUnavailableError extends Error {
  readonly code = "EXPERIMENT_EVALUATION_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "ExperimentEvaluationUnavailableError";
  }
}

function toExperimentAnalysis(
  document: WithId<ExperimentAnalysisDocument>,
): ExperimentAnalysis {
  return experimentAnalysisSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    experimentId: document.experimentId.toHexString(),
    analyzedAt: document.analyzedAt.toISOString(),
  });
}

export class ExperimentAnalysisRepository {
  private readonly analyses;
  private readonly experiments;
  private readonly storeSettings;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.analyses =
      db.collection<ExperimentAnalysisDocument>("experimentAnalyses");
    this.experiments =
      db.collection<ExperimentStatusDocument>("experiments");
    this.storeSettings =
      db.collection<StoreSettingsDocument>("storeSettings");
    this.auditLogs = db.collection("auditLogs");
  }

  async getConfig(
    context: AuthorizedStoreContext,
  ): Promise<EvaluationEngineConfig> {
    const settings = await this.storeSettings.findOne(
      {
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      },
      { projection: { experiments: 1 } },
    );
    return evaluationEngineConfigSchema.parse({
      ...defaultEvaluationEngineConfig,
      ...(settings?.experiments?.evaluation ?? {}),
    });
  }

  async listForExperiment(input: {
    context: AuthorizedStoreContext;
    experimentId: string;
  }): Promise<ExperimentAnalysis[]> {
    const documents = await this.analyses
      .find({
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        experimentId: new ObjectId(input.experimentId),
      })
      .sort({ analysisVersion: -1 })
      .limit(100)
      .toArray();
    return documents.map(toExperimentAnalysis);
  }

  async save(input: {
    context: AuthorizedStoreContext;
    experiment: Experiment;
    basedOnUpdatedAt: string;
    requestId: string;
    analysis: Omit<
      ExperimentAnalysis,
      | "id"
      | "organizationId"
      | "storeId"
      | "experimentId"
      | "analysisVersion"
      | "analyzedAt"
      | "createdBy"
    >;
  }): Promise<ExperimentAnalysis> {
    if (!this.client) throw new Error("Client MongoDB requis pour cette opération");
    const storeId = new ObjectId(input.context.storeId);
    const experimentId = new ObjectId(input.experiment.id);
    const logicalFilter = {
      organizationId: input.context.organizationId,
      storeId,
      experimentId,
      dataRevision: input.analysis.dataRevision,
      engineVersion: input.analysis.engineVersion,
    };
    const existing = await this.analyses.findOne(logicalFilter);
    if (existing) return toExperimentAnalysis(existing);

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const duplicate = await this.analyses.findOne(logicalFilter, { session });
        if (duplicate) return toExperimentAnalysis(duplicate);
        const current = await this.experiments.findOne(
          {
            _id: experimentId,
            organizationId: input.context.organizationId,
            storeId,
          },
          { session },
        );
        if (!current) throw new Error("Expérience introuvable ou accès refusé");
        if (current.updatedAt.toISOString() !== input.basedOnUpdatedAt) {
          throw new ExperimentConflictError();
        }
        if (current.status !== "awaiting_data" && current.status !== "analyzed") {
          throw new Error(
            "Le test doit être terminé avant de pouvoir être analysé",
          );
        }
        const nextStatus =
          current.status === "analyzed"
            ? "analyzed"
            : resolveExperimentStatus({
                currentStatus: current.status,
                action: "mark_analyzed",
              });
        if (nextStatus !== "analyzed") {
          throw new Error("Transition d’analyse invalide");
        }
        const latest = await this.analyses.findOne(
          {
            organizationId: input.context.organizationId,
            storeId,
            experimentId,
          },
          { sort: { analysisVersion: -1 }, projection: { analysisVersion: 1 }, session },
        );
        const analysisVersion = (latest?.analysisVersion ?? 0) + 1;
        const analyzedAt = new Date();
        const analysisId = new ObjectId();
        const analysis = experimentAnalysisSchema.parse({
          ...input.analysis,
          id: analysisId.toHexString(),
          organizationId: input.context.organizationId,
          storeId: input.context.storeId,
          experimentId: input.experiment.id,
          analysisVersion,
          analyzedAt: analyzedAt.toISOString(),
          createdBy: input.context.userId,
        });
        await this.analyses.insertOne(
          {
            _id: analysisId,
            organizationId: analysis.organizationId,
            storeId,
            experimentId,
            analysisVersion: analysis.analysisVersion,
            engineVersion: analysis.engineVersion,
            dataRevision: analysis.dataRevision,
            analyzedAt,
            createdBy: analysis.createdBy,
            periodWindow: analysis.periodWindow,
            baselineMethod: analysis.baselineMethod,
            baseline: analysis.baseline,
            experimentSnapshot: analysis.experimentSnapshot,
            configSnapshot: analysis.configSnapshot,
            evidenceQuality: analysis.evidenceQuality,
            metrics: analysis.metrics,
            economics: analysis.economics,
            warnings: analysis.warnings,
            evidenceRefs: analysis.evidenceRefs,
          },
          { session },
        );
        const updated = await this.experiments.updateOne(
          {
            _id: experimentId,
            organizationId: input.context.organizationId,
            storeId,
            updatedAt: current.updatedAt,
          },
          {
            $set: {
              status: nextStatus,
              analyzedAt,
              updatedAt: analyzedAt,
            },
          },
          { session },
        );
        if (updated.modifiedCount !== 1) throw new ExperimentConflictError();
        await this.auditLogs.insertOne(
          {
            organizationId: input.context.organizationId,
            storeId,
            actorId: input.context.userId,
            action: "experiment.analyzed",
            entityType: "experiment",
            entityId: experimentId,
            before: {
              status: current.status,
              updatedAt: current.updatedAt,
            },
            after: {
              status: "analyzed",
              analysisId,
              analysisVersion,
              dataRevision: analysis.dataRevision,
              evidenceQuality: analysis.evidenceQuality.grade,
            },
            requestId: input.requestId,
            timestamp: analyzedAt,
            createdAt: analyzedAt,
          },
          { session },
        );
        return analysis;
      });
      if (!result) throw new Error("L’analyse n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const duplicate = await this.analyses.findOne(logicalFilter);
        if (duplicate) return toExperimentAnalysis(duplicate);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
