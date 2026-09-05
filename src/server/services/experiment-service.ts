import "server-only";

import type {
  ExperimentCreateInput,
  ExperimentFinishInput,
  ExperimentStartInput,
  ExperimentUpdateInput,
} from "@/domain/experiments/schemas";
import { experimentFixtureOptionSchema } from "@/domain/experiments/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import {
  ExperimentNotFoundError,
  ExperimentRepository,
} from "@/server/repositories/experiment-repository";
import { CommercialEventRepository } from "@/server/repositories/commercial-event-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { getCurrentStoreLayout } from "@/server/services/layout-service";

function assertControlAuthorization(input: {
  context: AuthorizedStoreContext;
  controlContexts: AuthorizedStoreContext[];
  controlStoreIds: string[];
}): void {
  const expected = [...input.controlStoreIds].sort();
  const authorized = input.controlContexts.map(({ storeId }) => storeId).sort();
  const sameStores =
    expected.length === authorized.length &&
    expected.every((storeId, index) => storeId === authorized[index]);
  const sameOrganization = input.controlContexts.every(
    ({ organizationId }) => organizationId === input.context.organizationId,
  );

  if (!sameStores || !sameOrganization) throw new StoreAccessDeniedError();
}

export async function listExperiments(context: AuthorizedStoreContext) {
  return new ExperimentRepository(await getAppDb()).listForStore(context);
}

export async function getExperimentWorkspace(
  context: AuthorizedStoreContext,
) {
  const db = await getAppDb();
  const [{ layout }, experiments, products, commercialEvents] =
    await Promise.all([
      getCurrentStoreLayout(context),
      new ExperimentRepository(db).listForStore(context),
      new ProductRepository(db).listOptions(context),
      new CommercialEventRepository(db).listForStore(context),
    ]);

  return {
    experiments,
    products,
    commercialEvents,
    fixtures:
      layout?.fixtures.map((fixture) =>
        experimentFixtureOptionSchema.parse({
          id: fixture.id,
          label: fixture.name,
          type: fixture.type,
        }),
      ) ?? [],
  };
}

export async function getExperiment(input: {
  context: AuthorizedStoreContext;
  experimentId: string;
}) {
  const experiment = await new ExperimentRepository(
    await getAppDb(),
  ).findForStore(input.context, input.experimentId);
  if (!experiment) throw new ExperimentNotFoundError();
  return experiment;
}

export async function createExperiment(input: {
  context: AuthorizedStoreContext;
  controlContexts: AuthorizedStoreContext[];
  createInput: ExperimentCreateInput;
  requestId: string;
}) {
  assertControlAuthorization({
    context: input.context,
    controlContexts: input.controlContexts,
    controlStoreIds: input.createInput.baselineConfig.controlStoreIds,
  });
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new ExperimentRepository(db, client).create(input);
}

export async function updateExperimentDefinition(input: {
  context: AuthorizedStoreContext;
  controlContexts: AuthorizedStoreContext[];
  experimentId: string;
  updateInput: ExperimentUpdateInput;
  requestId: string;
}) {
  assertControlAuthorization({
    context: input.context,
    controlContexts: input.controlContexts,
    controlStoreIds:
      input.updateInput.action === "cancel"
        ? []
        : input.updateInput.baselineConfig.controlStoreIds,
  });
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new ExperimentRepository(db, client).updateDefinition(input);
}

export async function startExperiment(input: {
  context: AuthorizedStoreContext;
  experimentId: string;
  startInput: ExperimentStartInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new ExperimentRepository(db, client).start(input);
}

export async function finishExperiment(input: {
  context: AuthorizedStoreContext;
  experimentId: string;
  finishInput: ExperimentFinishInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new ExperimentRepository(db, client).finish(input);
}
