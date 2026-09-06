import "server-only";

import {
  storeConfigurationWorkspaceSchema,
  type PeriodTargetUpsertInput,
  type StoreSettingsUpdateInput,
} from "@/domain/configuration/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { StoreConfigurationRepository } from "@/server/repositories/store-configuration-repository";

export async function getStoreConfigurationWorkspace(
  context: AuthorizedStoreContext,
) {
  const repository = new StoreConfigurationRepository(await getAppDb());
  const [settings, targets] = await Promise.all([
    repository.getSettings(context),
    repository.listTargets(context),
  ]);
  return storeConfigurationWorkspaceSchema.parse({ settings, targets });
}

export async function updateStoreSettings(input: {
  context: AuthorizedStoreContext;
  updateInput: StoreSettingsUpdateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new StoreConfigurationRepository(db, client).updateSettings(input);
}

export async function upsertStorePeriodTarget(input: {
  context: AuthorizedStoreContext;
  targetInput: PeriodTargetUpsertInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new StoreConfigurationRepository(db, client).upsertTarget(input);
}
