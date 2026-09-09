import "server-only";

import { buildOrderSuggestionLine, calculateOrderCycle } from "@/domain/ordering/calculations";
import {
  orderSuggestionWorkspaceSchema,
  type OrderSuggestionApprovalInput,
  type OrderSuggestionCreateInput,
} from "@/domain/ordering/schemas";
import { shiftBusinessDate } from "@/domain/imports/daily-dates";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { OrderSuggestionRepository } from "@/server/repositories/order-suggestion-repository";
import { StoreConfigurationRepository } from "@/server/repositories/store-configuration-repository";
import { getDayOfWeekForecast } from "@/server/services/day-of-week-forecast-service";
import { getInventoryWorkspace } from "@/server/services/inventory-service";

export class OrderSuggestionNonOrderingDayError extends Error {
  constructor() {
    super("Le dimanche n’est pas un jour de préparation de commande");
    this.name = "OrderSuggestionNonOrderingDayError";
  }
}

function daysAfter(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
      86_400_000,
  );
}

export async function getOrderSuggestionWorkspace(input: {
  context: AuthorizedStoreContext;
  orderDate: string;
}) {
  const cycle = calculateOrderCycle(input.orderDate);
  const db = await getAppDb();
  const [inventory, latestSuggestion] = await Promise.all([
    getInventoryWorkspace({
      context: input.context,
      businessDate: input.orderDate,
    }),
    new OrderSuggestionRepository(db).findLatest(input),
  ]);

  return orderSuggestionWorkspaceSchema.parse({
    cycle,
    latestSuggestion,
    exactStockSnapshotCount: inventory.products.filter(
      ({ daySnapshot }) => daySnapshot !== null,
    ).length,
    productCount: inventory.products.length,
  });
}

export async function createOrderSuggestion(input: {
  context: AuthorizedStoreContext;
  createInput: OrderSuggestionCreateInput;
  requestId: string;
}) {
  const cycle = calculateOrderCycle(input.createInput.orderDate);
  if (!cycle.orderingAllowed || !cycle.deliveryDate) {
    throw new OrderSuggestionNonOrderingDayError();
  }
  const forecastAsOf = shiftBusinessDate(input.createInput.orderDate, -1);
  const lastCoverageDate = cycle.coverageDates.at(-1)!;
  const horizonDays = daysAfter(forecastAsOf, lastCoverageDate);
  const db = await getAppDb();
  const [inventory, forecast, settings] = await Promise.all([
    getInventoryWorkspace({
      context: input.context,
      businessDate: input.createInput.orderDate,
    }),
    getDayOfWeekForecast(input.context, {
      asOf: forecastAsOf,
      horizonDays,
    }),
    new StoreConfigurationRepository(db).getSettings(input.context),
  ]);
  const stockByProduct = new Map(
    inventory.products.map(({ id, daySnapshot }) => [id, daySnapshot]),
  );
  const forecastByProduct = new Map(
    forecast.products.map((product) => [product.productId, product]),
  );
  const lines = inventory.products.map((product) =>
    buildOrderSuggestionLine({
      product: { id: product.id, label: product.label },
      stockSnapshot: stockByProduct.get(product.id) ?? null,
      forecast: forecastByProduct.get(product.id) ?? null,
      coverageDates: cycle.coverageDates,
      targetClosingStockRatio:
        settings.ordering.targetClosingStockRatio,
    }),
  );
  const counts = {
    readyLineCount: lines.filter(({ status }) => status === "ready").length,
    noOrderLineCount: lines.filter(({ status }) => status === "no_order").length,
    unavailableLineCount: lines.filter(({ status }) => status === "unavailable")
      .length,
  };
  const [database, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new OrderSuggestionRepository(database, client).createDraft({
    context: input.context,
    idempotencyKey: input.createInput.idempotencyKey,
    requestId: input.requestId,
    expectedDataRevision: forecast.dataRevision,
    draft: {
      organizationId: input.context.organizationId,
      storeId: input.context.storeId,
      orderDate: input.createInput.orderDate,
      deliveryDate: cycle.deliveryDate,
      coverageDates: cycle.coverageDates,
      lines,
      ...counts,
      inputRevision: forecast.dataRevision,
      forecastAsOf,
      forecastModelVersion: forecast.modelVersion,
      forecastConfigurationVersion: forecast.config.configurationVersion,
      config: settings.ordering,
      assumptions: [
        "Le stock saisi avant la commande est le reliquat disponible à déduire du besoin futur.",
        "L’arrivage reçu après la commande est destiné aux ventes du jour et n’est pas ajouté au calcul.",
        "Le stock final cible est nul par défaut afin de privilégier fraîcheur et réduction de la casse.",
      ],
      limitations: [
        "Les jours fériés et fermetures fournisseur exceptionnelles ne sont pas modélisés.",
        "La météo et les promotions observées ne modifient pas encore la prévision de demande.",
        "Cette proposition ne crée et ne transmet aucune commande fournisseur.",
      ],
    },
  });
}

export async function approveOrderSuggestion(input: {
  context: AuthorizedStoreContext;
  suggestionId: string;
  approvalInput: OrderSuggestionApprovalInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new OrderSuggestionRepository(db, client).approve(input);
}
