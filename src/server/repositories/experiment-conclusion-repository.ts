import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  experimentConclusionSchema,
  type ExperimentConclusion,
  type ExperimentConclusionInput,
  type ExperimentSystemEvidenceSummary,
} from "@/domain/experiments/conclusion";
import { resolveExperimentStatus } from "@/domain/experiments/lifecycle";
import { experimentSchema, type Experiment } from "@/domain/experiments/schemas";
import { buildExperimentScope } from "@/domain/experiments/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentTransitionError,
} from "@/server/repositories/experiment-repository";

interface ExperimentConclusionDocument
  extends Omit<
    ExperimentConclusion,
    | "id"
    | "storeId"
    | "experimentId"
    | "analysisId"
    | "concludedAt"
  > {
  storeId: ObjectId;
  experimentId: ObjectId;
  analysisId: ObjectId;
  concludedAt: Date;
  createdAt: Date;
}

interface ExperimentStatusDocument {
  organizationId: string;
  storeId: ObjectId;
  status: Experiment["status"];
  updatedAt: Date;
  concludedAt: Date | null;
  linkedDecisionIds: ObjectId[];
}

interface AnalysisIdentityDocument {
  organizationId: string;
  storeId: ObjectId;
  experimentId: ObjectId;
  analysisVersion: number;
}

function toConclusion(
  document: WithId<ExperimentConclusionDocument>,
): ExperimentConclusion {
  return experimentConclusionSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    experimentId: document.experimentId.toHexString(),
    analysisId: document.analysisId.toHexString(),
    concludedAt: document.concludedAt.toISOString(),
  });
}

export class ExperimentConclusionRepository {
  private readonly conclusions;
  private readonly experiments;
  private readonly analyses;
  private readonly decisionLogs;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.conclusions =
      db.collection<ExperimentConclusionDocument>("experimentConclusions");
    this.experiments =
      db.collection<ExperimentStatusDocument>("experiments");
    this.analyses =
      db.collection<AnalysisIdentityDocument>("experimentAnalyses");
    this.decisionLogs = db.collection("decisionLogs");
    this.auditLogs = db.collection("auditLogs");
  }

  async findActiveForExperiment(input: {
    context: AuthorizedStoreContext;
    experimentId: string;
  }): Promise<ExperimentConclusion | null> {
    const scope = buildExperimentScope(input.context);
    const conclusion = await this.conclusions.findOne({
      organizationId: scope.organizationId,
      storeId: new ObjectId(scope.storeId),
      experimentId: new ObjectId(input.experimentId),
      active: true,
    });
    return conclusion ? toConclusion(conclusion) : null;
  }

  async conclude(input: {
    context: AuthorizedStoreContext;
    experiment: Experiment;
    analysis: import("@/domain/experiments/evaluation-schemas").ExperimentAnalysis;
    conclusionInput: ExperimentConclusionInput;
    systemEvidenceSummary: ExperimentSystemEvidenceSummary;
    requestId: string;
  }): Promise<ExperimentConclusion> {
    if (!this.client) {
      throw new Error("Client Mongo requis pour conclure une expérience");
    }
    const scope = buildExperimentScope(input.context);
    const storeId = new ObjectId(scope.storeId);
    const experimentId = new ObjectId(input.experiment.id);
    const analysisId = new ObjectId(input.analysis.id);
    const duplicateFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: input.conclusionInput.idempotencyKey,
    };
    const duplicate = await this.conclusions.findOne(duplicateFilter);
    if (duplicate) return toConclusion(duplicate);

    const session = this.client.startSession();
    try {
      const conclusion = await session.withTransaction(async () => {
        const repeated = await this.conclusions.findOne(duplicateFilter, {
          session,
        });
        if (repeated) return toConclusion(repeated);

        const current = await this.experiments.findOne(
          {
            _id: experimentId,
            organizationId: scope.organizationId,
            storeId,
          },
          { session },
        );
        if (!current) throw new ExperimentNotFoundError();
        if (current.updatedAt.toISOString() !== input.conclusionInput.basedOnUpdatedAt) {
          throw new ExperimentConflictError();
        }
        const nextStatus = resolveExperimentStatus({
          currentStatus: current.status,
          action: "conclude",
        });
        if (nextStatus !== "concluded") {
          throw new ExperimentTransitionError(
            "Seule une expérience analysée peut être conclue",
          );
        }

        const analysis = await this.analyses.findOne(
          {
            _id: analysisId,
            organizationId: scope.organizationId,
            storeId,
            experimentId,
            analysisVersion: input.analysis.analysisVersion,
          },
          { session },
        );
        if (!analysis) {
          throw new ExperimentTransitionError(
            "L’analyse sélectionnée n’appartient pas à cette expérience",
          );
        }
        const active = await this.conclusions.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            experimentId,
            active: true,
          },
          { session },
        );
        if (active) {
          throw new ExperimentTransitionError(
            "Cette expérience possède déjà une conclusion active",
          );
        }

        const now = new Date();
        const conclusionId = new ObjectId();
        const decisionLogId = new ObjectId();
        const record = experimentConclusionSchema.parse({
          id: conclusionId.toHexString(),
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          experimentId: input.experiment.id,
          analysisId: input.analysis.id,
          analysisVersion: input.analysis.analysisVersion,
          active: true,
          systemSuggestedVerdict:
            input.systemEvidenceSummary.suggestedVerdict,
          systemEvidenceSummary: input.systemEvidenceSummary,
          managerVerdict: input.conclusionInput.managerVerdict,
          managerDecision: input.conclusionInput.managerDecision,
          rationale: input.conclusionInput.rationale,
          reusableTags: input.conclusionInput.reusableTags,
          actorUserId: input.context.userId,
          idempotencyKey: input.conclusionInput.idempotencyKey,
          concludedAt: now.toISOString(),
        });
        const concludedExperiment = experimentSchema.parse({
          ...input.experiment,
          status: nextStatus,
          linkedDecisionIds: [
            ...input.experiment.linkedDecisionIds,
            decisionLogId.toHexString(),
          ],
          concludedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });

        await this.conclusions.insertOne(
          {
            _id: conclusionId,
            organizationId: scope.organizationId,
            storeId,
            experimentId,
            analysisId,
            analysisVersion: record.analysisVersion,
            active: true,
            systemSuggestedVerdict: record.systemSuggestedVerdict,
            systemEvidenceSummary: record.systemEvidenceSummary,
            managerVerdict: record.managerVerdict,
            managerDecision: record.managerDecision,
            rationale: record.rationale,
            reusableTags: record.reusableTags,
            actorUserId: record.actorUserId,
            idempotencyKey: record.idempotencyKey,
            concludedAt: now,
            createdAt: now,
          },
          { session },
        );
        await this.decisionLogs.insertOne(
          {
            _id: decisionLogId,
            entryType: "experiment_conclusion",
            conclusionId,
            experimentId,
            organizationId: scope.organizationId,
            storeId,
            actorUserId: input.context.userId,
            managerVerdict: record.managerVerdict,
            systemSuggestedVerdict: record.systemSuggestedVerdict,
            decision: record.managerDecision,
            rationale: record.rationale,
            reusableTags: record.reusableTags,
            experimentSnapshot: concludedExperiment,
            analysisSnapshot: input.analysis,
            idempotencyKey: record.idempotencyKey,
            decidedAt: now,
            createdAt: now,
          },
          { session },
        );
        const updated = await this.experiments.updateOne(
          {
            _id: experimentId,
            organizationId: scope.organizationId,
            storeId,
            updatedAt: current.updatedAt,
          },
          {
            $set: {
              status: nextStatus,
              concludedAt: now,
              updatedAt: now,
            },
            $push: { linkedDecisionIds: decisionLogId },
          },
          { session },
        );
        if (updated.modifiedCount !== 1) throw new ExperimentConflictError();
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: input.context.userId,
            action: "experiment.concluded",
            entityType: "experiment",
            entityId: experimentId,
            before: input.experiment,
            after: {
              experiment: concludedExperiment,
              conclusion: record,
              decisionLogId,
            },
            requestId: input.requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        return record;
      });
      if (!conclusion) {
        throw new Error("La conclusion n’a pas été enregistrée");
      }
      return conclusion;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.conclusions.findOne(duplicateFilter);
        if (repeated) return toConclusion(repeated);
        throw new ExperimentConflictError(
          "Cette expérience possède déjà une conclusion active",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
