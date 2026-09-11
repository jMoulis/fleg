import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  preparedWorkspaceSchema,
  offlineIdentitySchema,
} from "@/domain/offline/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { requireSession } from "@/server/auth/session";
import { getAppDb } from "@/server/db/mongo-client";
import {
  InventoryConflictError,
  InventoryRepository,
} from "@/server/repositories/inventory-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { StoreRepository } from "@/server/repositories/store-repository";

export const offlinePolicySchema = z
  .object({
    OFFLINE_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(24).default(12),
    OFFLINE_RETENTION_HOURS: z.coerce.number().int().min(1).max(48).default(24),
    OFFLINE_MAX_LOCAL_DRAFTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(30)
      .default(14),
    OFFLINE_MAX_PRODUCTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(2_000)
      .default(2_000),
  })
  .refine((v) => v.OFFLINE_RETENTION_HOURS >= v.OFFLINE_MAX_AGE_HOURS);

export async function getOfflineAccess(
  context: AuthorizedStoreContext,
  headers: Headers,
) {
  const session = await requireSession(headers);
  if (
    session.user.id !== context.userId ||
    !context.permissions.includes("inventory.read")
  ) {
    throw new StoreAccessDeniedError();
  }
  return {
    identity: offlineIdentitySchema.parse({
      ...context,
      sessionBinding: createHash("sha256")
        .update(session.session.id)
        .digest("hex"),
    }),
    sessionExpiresAt: session.session.expiresAt,
    canWriteInventory: context.permissions.includes("inventory.write"),
  };
}

export async function prepareOfflineWorkspace(input: {
  context: AuthorizedStoreContext;
  businessDate: string;
  headers: Headers;
}) {
  const { context } = input;
  const { identity, sessionExpiresAt } = await getOfflineAccess(
    context,
    input.headers,
  );
  const policy = offlinePolicySchema.parse(process.env);
  const db = await getAppDb();
  const stores = new StoreRepository(db);
  const before = await stores.getOfflineReferenceMetadata(context);
  if (!before) throw new StoreAccessDeniedError();
  // Fetch one sentinel beyond the budget: never mistake a truncated page for a complete catalogue.
  const products = await new ProductRepository(db).listOptions(
    context,
    policy.OFFLINE_MAX_PRODUCTS + 1,
  );
  if (products.length > policy.OFFLINE_MAX_PRODUCTS) {
    throw new InventoryConflictError(
      "Catalogue trop volumineux : aucune préparation effectuée. Contactez votre administrateur.",
    );
  }
  const workspace = await new InventoryRepository(db).getWorkspace({
    ...input,
    products,
  });
  const after = await stores.getOfflineReferenceMetadata(context);
  if (!after || before.dataRevision !== after.dataRevision) {
    throw new InventoryConflictError(
      "Les données ont changé pendant la préparation. Réessayez.",
    );
  }
  const now = Date.now();
  const lines = new Map(
    workspace.count?.lines.map((line) => [line.productId, line]),
  );
  return preparedWorkspaceSchema.parse({
    schemaVersion: 1,
    canWriteInventory: context.permissions.includes("inventory.write"),
    timeZone: before.timeZone,
    maxLocalDrafts: policy.OFFLINE_MAX_LOCAL_DRAFTS,
    identity,
    storeName: before.name,
    businessDate: workspace.businessDate,
    preparedAt: new Date(now).toISOString(),
    expiresAt: new Date(
      Math.min(
        new Date(sessionExpiresAt).getTime(),
        now + policy.OFFLINE_MAX_AGE_HOURS * 3_600_000,
      ),
    ).toISOString(),
    purgeAt: new Date(
      now + policy.OFFLINE_RETENTION_HOURS * 3_600_000,
    ).toISOString(),
    dataRevision: before.dataRevision ?? 0,
    productCount: products.length,
    countReference: workspace.count,
    products: workspace.products.map((product) => ({
      id: product.id,
      label: product.label,
      profile: product.profile,
      countLine: lines.get(product.id) ?? null,
      lastStock: product.latestAvailability
        ? {
            quantity: product.latestAvailability.snapshot.onHandQuantity,
            unit: product.latestAvailability.snapshot.stockUnit,
            observedAt: product.latestAvailability.snapshot.observedAt,
          }
        : null,
    })),
  });
}
