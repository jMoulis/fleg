import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export class NetworkStoreSetError extends Error {
  readonly code = "INVALID_NETWORK_STORE_SET";

  constructor(message = "Le périmètre réseau est invalide ou non autorisé") {
    super(message);
    this.name = "NetworkStoreSetError";
  }
}

export function buildNetworkScope(contexts: AuthorizedStoreContext[]) {
  const first = contexts[0];
  if (!first) throw new NetworkStoreSetError("Sélectionnez au moins un magasin");
  if (
    contexts.some(
      (context) =>
        context.organizationId !== first.organizationId ||
        context.userId !== first.userId,
    )
  ) {
    throw new NetworkStoreSetError(
      "Tous les magasins doivent appartenir à la même organisation autorisée",
    );
  }
  const storeIds = contexts.map(({ storeId }) => storeId);
  if (new Set(storeIds).size !== storeIds.length) {
    throw new NetworkStoreSetError(
      "Un magasin ne peut être sélectionné qu’une seule fois",
    );
  }
  return {
    organizationId: first.organizationId,
    userId: first.userId,
    storeIds: [...storeIds].sort(),
  } as const;
}
