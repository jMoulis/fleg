import "server-only";

import {
  calculateNetworkDashboard,
  type NetworkStoreInput,
} from "@/domain/network/calculations";
import { buildNetworkScope } from "@/domain/network/store-scope";
import { shiftMonth } from "@/domain/analytics/calculations";
import { periodKeySchema } from "@/domain/imports/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { NetworkAnalyticsRepository } from "@/server/repositories/network-analytics-repository";

export async function getNetworkDashboard(
  contexts: AuthorizedStoreContext[],
  requestedPeriod?: string,
) {
  const scope = buildNetworkScope(contexts);
  const repository = new NetworkAnalyticsRepository(await getAppDb());
  const periodKey = requestedPeriod
    ? periodKeySchema.parse(requestedPeriod)
    : await repository.findLatestPeriod(contexts);

  if (!periodKey) return null;

  const [stores, facts, markdownByStore, targetsByStore, capacityByStore] =
    await Promise.all([
      repository.findStores(contexts),
      repository.findFacts(contexts, [periodKey, shiftMonth(periodKey, -12)]),
      repository.findMarkdownByStore(contexts, periodKey),
      repository.findTargetsByStore(contexts, periodKey),
      repository.findLayoutCapacityByStore(contexts),
    ]);
  const actionCountByStore =
    await repository.findPrioritizedActionCountByStore(
      contexts,
      periodKey,
      stores,
    );
  const storeInputs: NetworkStoreInput[] = stores.map((store) => {
    const capacity = capacityByStore.get(store.storeId);

    return {
      ...store,
      markdownCents: markdownByStore.get(store.storeId) ?? null,
      targetRevenueCents: targetsByStore.get(store.storeId) ?? null,
      effectiveCommercialWidthM:
        capacity?.effectiveCommercialWidthM ?? null,
      geometryConfirmed: capacity?.geometryConfirmed ?? false,
      prioritizedActionCount: actionCountByStore.get(store.storeId) ?? 0,
    };
  });

  return calculateNetworkDashboard({
    organizationId: scope.organizationId,
    periodKey,
    stores: storeInputs,
    facts,
  });
}
