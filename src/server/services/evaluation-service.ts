import "server-only";

import { calculateExperimentEvaluation } from "@/domain/experiments/evaluation";
import { buildControlRevisionKey } from "@/domain/experiments/control-baseline";
import type { ExperimentEvaluateInput } from "@/domain/experiments/evaluation-schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import {
  ExperimentAnalysisRepository,
  ExperimentEvaluationUnavailableError,
} from "@/server/repositories/experiment-analysis-repository";
import { ExperimentBaselineRepository } from "@/server/repositories/experiment-baseline-repository";
import {
  ExperimentNotFoundError,
  ExperimentRepository,
} from "@/server/repositories/experiment-repository";
import { MarkdownRepository } from "@/server/repositories/markdown-repository";
import { getExperimentBaseline } from "@/server/services/baseline-service";

export async function listExperimentAnalyses(input: {
  context: AuthorizedStoreContext;
  experimentId: string;
}) {
  const db = await getAppDb();
  const experiment = await new ExperimentRepository(db).findForStore(
    input.context,
    input.experimentId,
  );
  if (!experiment) throw new ExperimentNotFoundError();
  return new ExperimentAnalysisRepository(db).listForExperiment(input);
}

export async function evaluateExperiment(input: {
  context: AuthorizedStoreContext;
  controlContexts?: AuthorizedStoreContext[];
  experimentId: string;
  evaluateInput: ExperimentEvaluateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const experimentRepository = new ExperimentRepository(db);
  const experiment = await experimentRepository.findForStore(
    input.context,
    input.experimentId,
  );
  if (!experiment) throw new ExperimentNotFoundError();
  if (experiment.status !== "awaiting_data" && experiment.status !== "analyzed") {
    throw new ExperimentEvaluationUnavailableError(
      "Le test doit être terminé avant de lancer son analyse.",
    );
  }
  if (!experiment.actualStartAt || !experiment.actualEndAt) {
    throw new ExperimentEvaluationUnavailableError(
      "Les dates d’exécution réelles doivent être confirmées avant l’analyse.",
    );
  }

  const baseline = await getExperimentBaseline({
    context: input.context,
    controlContexts: input.controlContexts,
    experimentId: input.experimentId,
  });
  if (baseline.readiness === "unavailable" || !baseline.expectedWithoutTest) {
    throw new ExperimentEvaluationUnavailableError(
      baseline.warnings[0]?.message ??
        "La référence n’est pas disponible pour cette période.",
    );
  }

  const baselineRepository = new ExperimentBaselineRepository(db);
  const analysisRepository = new ExperimentAnalysisRepository(db, client);
  const markdownRepository = new MarkdownRepository(db);
  const requiredPeriodKeys = [
    ...new Set([
      ...baseline.testPeriodKeys,
      ...baseline.evidencePeriodKeys,
    ]),
  ];
  const [salesFacts, markdownFacts, config] = await Promise.all([
    baselineRepository.findMonthlyFacts(input.context, requiredPeriodKeys),
    markdownRepository.findForPeriods({
      context: input.context,
      periodKeys: requiredPeriodKeys,
      productIds: experiment.productIds,
    }),
    analysisRepository.getConfig(input.context),
  ]);
  const availableTestPeriods = new Set(
    salesFacts.map(({ periodKey }) => periodKey),
  );
  const missingTestPeriods = baseline.testPeriodKeys.filter(
    (periodKey) => !availableTestPeriods.has(periodKey),
  );
  if (missingTestPeriods.length > 0) {
    throw new ExperimentEvaluationUnavailableError(
      `Les données de la période test sont encore manquantes (${missingTestPeriods.join(", ")}).`,
    );
  }
  const currentDataRevision = await baselineRepository.getDataRevision(
    input.context,
  );
  if (currentDataRevision !== baseline.dataRevision) {
    throw new ExperimentEvaluationUnavailableError(
      "Les données ont changé pendant le calcul. Relancez l’analyse.",
    );
  }
  const controlDataRevisions =
    baseline.controlComparison?.stores.map(({ storeId, dataRevision }) => ({
      storeId,
      dataRevision,
    })) ?? [];
  const currentControlRevisions = await Promise.all(
    (input.controlContexts ?? []).map(async (context) => ({
      storeId: context.storeId,
      dataRevision: await baselineRepository.getDataRevision(context),
    })),
  );
  const snapshotRevisionByStoreId = new Map(
    controlDataRevisions.map(({ storeId, dataRevision }) => [
      storeId,
      dataRevision,
    ]),
  );
  if (
    currentControlRevisions.length !== controlDataRevisions.length ||
    currentControlRevisions.some(
      ({ storeId, dataRevision }) =>
        snapshotRevisionByStoreId.get(storeId) !== dataRevision,
    )
  ) {
    throw new ExperimentEvaluationUnavailableError(
      "Les données d’un magasin témoin ont changé pendant le calcul. Relancez l’analyse.",
    );
  }
  const controlRevisionKey = buildControlRevisionKey(controlDataRevisions);

  const evaluation = calculateExperimentEvaluation({
    experiment,
    baseline,
    salesFacts,
    markdownFacts,
    config,
  });
  const analysis = await analysisRepository.save({
    context: input.context,
    experiment,
    basedOnUpdatedAt: input.evaluateInput.basedOnUpdatedAt,
    requestId: input.requestId,
    analysis: {
      engineVersion: config.engineVersion,
      dataRevision: baseline.dataRevision,
      controlRevisionKey,
      controlDataRevisions,
      periodWindow: {
        startsAt: experiment.actualStartAt,
        endsAt: experiment.actualEndAt,
        periodKeys: baseline.testPeriodKeys,
      },
      baselineMethod: baseline.method,
      baseline,
      experimentSnapshot: experiment,
      configSnapshot: config,
      evidenceQuality: evaluation.evidenceQuality,
      metrics: evaluation.metrics,
      economics: evaluation.economics,
      warnings: evaluation.warnings,
      evidenceRefs: [
        {
          source: "salesFacts",
          storeId: input.context.storeId,
          periodKeys: requiredPeriodKeys,
          recordCount: salesFacts.length,
          dataRevision: baseline.dataRevision,
        },
        {
          source: "markdownFacts",
          storeId: input.context.storeId,
          periodKeys: requiredPeriodKeys,
          recordCount: markdownFacts.length,
          dataRevision: baseline.dataRevision,
        },
        ...(baseline.controlComparison?.stores.map((store) => ({
          source: "salesFacts" as const,
          storeId: store.storeId,
          periodKeys: requiredPeriodKeys,
          recordCount: store.recordCount,
          dataRevision: store.dataRevision,
        })) ?? []),
      ],
    },
  });
  const updatedExperiment = await experimentRepository.findForStore(
    input.context,
    input.experimentId,
  );
  if (!updatedExperiment) throw new ExperimentNotFoundError();
  return { analysis, experiment: updatedExperiment };
}
