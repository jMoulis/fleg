import "server-only";

import {
  suggestExperimentVerdict,
  type ExperimentConclusionInput,
} from "@/domain/experiments/conclusion";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { ExperimentAnalysisRepository } from "@/server/repositories/experiment-analysis-repository";
import { ExperimentBaselineRepository } from "@/server/repositories/experiment-baseline-repository";
import { ExperimentConclusionRepository } from "@/server/repositories/experiment-conclusion-repository";
import {
  ExperimentNotFoundError,
  ExperimentRepository,
  ExperimentTransitionError,
} from "@/server/repositories/experiment-repository";

export async function getActiveExperimentConclusion(input: {
  context: AuthorizedStoreContext;
  experimentId: string;
}) {
  const db = await getAppDb();
  const experiment = await new ExperimentRepository(db).findForStore(
    input.context,
    input.experimentId,
  );
  if (!experiment) throw new ExperimentNotFoundError();
  return new ExperimentConclusionRepository(db).findActiveForExperiment(input);
}

export async function concludeExperiment(input: {
  context: AuthorizedStoreContext;
  experimentId: string;
  conclusionInput: ExperimentConclusionInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const experimentRepository = new ExperimentRepository(db);
  const conclusionRepository = new ExperimentConclusionRepository(db, client);
  const experiment = await experimentRepository.findForStore(
    input.context,
    input.experimentId,
  );
  if (!experiment) throw new ExperimentNotFoundError();
  if (experiment.status === "concluded") {
    const existing = await conclusionRepository.findActiveForExperiment({
      context: input.context,
      experimentId: input.experimentId,
    });
    if (existing?.idempotencyKey === input.conclusionInput.idempotencyKey) {
      return { conclusion: existing, experiment };
    }
    throw new ExperimentTransitionError(
      "Cette expérience possède déjà une conclusion active",
    );
  }
  if (experiment.status !== "analyzed") {
    throw new ExperimentTransitionError(
      "Seule une expérience analysée peut être conclue",
    );
  }

  const analyses = await new ExperimentAnalysisRepository(db).listForExperiment({
    context: input.context,
    experimentId: input.experimentId,
  });
  const latestAnalysis = analyses[0];
  if (!latestAnalysis || latestAnalysis.id !== input.conclusionInput.analysisId) {
    throw new ExperimentTransitionError(
      "La conclusion doit utiliser la dernière version de l’analyse",
    );
  }
  const currentDataRevision = await new ExperimentBaselineRepository(
    db,
  ).getDataRevision(input.context);
  if (latestAnalysis.dataRevision !== currentDataRevision) {
    throw new ExperimentTransitionError(
      "Les données ont changé depuis cette analyse. Recalculez-la avant de conclure",
    );
  }

  const systemEvidenceSummary = suggestExperimentVerdict(latestAnalysis);
  const conclusion = await conclusionRepository.conclude({
    context: input.context,
    experiment,
    analysis: latestAnalysis,
    conclusionInput: input.conclusionInput,
    systemEvidenceSummary,
    requestId: input.requestId,
  });
  const updatedExperiment = await experimentRepository.findForStore(
    input.context,
    input.experimentId,
  );
  if (!updatedExperiment) throw new ExperimentNotFoundError();
  return { conclusion, experiment: updatedExperiment };
}
