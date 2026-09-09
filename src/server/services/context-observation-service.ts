import "server-only";

import { calculateBusinessContextView } from "@/domain/context-observations/calculations";
import {
  businessContextDefaultRangeDays,
  type BusinessContextRangeQuery,
  type PromotionObservationCreateInput,
  type WeatherObservationCreateInput,
} from "@/domain/context-observations/schemas";
import { shiftBusinessDate } from "@/domain/imports/daily-dates";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { ContextObservationRepository } from "@/server/repositories/context-observation-repository";

export async function getBusinessContextView(
  context: AuthorizedStoreContext,
  query: BusinessContextRangeQuery,
) {
  const repository = new ContextObservationRepository(await getAppDb());
  const productId = await repository.requireProduct(context, query.productId);
  const to = query.to ?? new Date().toISOString().slice(0, 10);
  const from =
    query.from ?? shiftBusinessDate(to, -(businessContextDefaultRangeDays - 1));
  const [promotionObservations, weatherObservations, dataRevision] =
    await Promise.all([
      repository.listPromotions({ context, from, to, productId }),
      repository.listWeather({ context, from, to }),
      repository.getDataRevision(context),
    ]);

  return calculateBusinessContextView({
    from,
    to,
    productId,
    promotionObservations,
    weatherObservations,
    dataRevision,
  });
}

export async function createPromotionObservation(input: {
  context: AuthorizedStoreContext;
  createInput: PromotionObservationCreateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new ContextObservationRepository(db, client).createPromotion(input);
}

export async function createWeatherObservation(input: {
  context: AuthorizedStoreContext;
  createInput: WeatherObservationCreateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new ContextObservationRepository(db, client).createWeather(input);
}
