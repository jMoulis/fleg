import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  promotionObservationSchema,
  weatherObservationSchema,
  type PromotionObservation,
  type PromotionObservationCreateInput,
  type WeatherObservation,
  type WeatherObservationCreateInput,
} from "@/domain/context-observations/schemas";
import { buildContextObservationScope } from "@/domain/context-observations/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

type StoredPromotionProvenance =
  | { kind: "manual" }
  | { kind: "commercial_event"; commercialEventId: ObjectId };

interface PromotionObservationDocument
  extends Omit<
    PromotionObservation,
    | "id"
    | "storeId"
    | "departmentId"
    | "productIds"
    | "provenance"
    | "recordedAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  productIds: ObjectId[];
  provenance: StoredPromotionProvenance;
  recordedAt: Date;
}

interface WeatherObservationDocument
  extends Omit<
    WeatherObservation,
    "id" | "storeId" | "departmentId" | "recordedAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  recordedAt: Date;
}

interface ContextObservationCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  kind: "promotion" | "weather";
  observationId: ObjectId;
  snapshot: PromotionObservation | WeatherObservation;
  createdAt: Date;
}

interface ProductReferenceDocument {
  organizationId: string;
  storeId: ObjectId;
  active: boolean;
}

interface DepartmentReferenceDocument {
  organizationId: string;
  storeId: ObjectId;
  key: "fruit_vegetable";
  active: boolean;
}

interface StoreReferenceDocument {
  organizationId: string;
  active: boolean;
  dataRevision: number;
}

interface CommercialEventReferenceDocument {
  organizationId: string;
  storeId: ObjectId;
  startsOn: string;
  endsOn: string;
  productIds: ObjectId[];
  status: "draft" | "published" | "completed" | "cancelled";
}

export class ContextObservationReferenceError extends Error {
  readonly code = "CONTEXT_OBSERVATION_REFERENCE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "ContextObservationReferenceError";
  }
}

export class ContextObservationConflictError extends Error {
  readonly code = "CONTEXT_OBSERVATION_CONFLICT";

  constructor(message = "La clé de commande est déjà utilisée pour une autre observation") {
    super(message);
    this.name = "ContextObservationConflictError";
  }
}

function toPromotionObservation(
  document: WithId<PromotionObservationDocument>,
): PromotionObservation {
  const { _id, ...value } = document;
  return promotionObservationSchema.parse({
    ...value,
    id: _id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    productIds: document.productIds.map((productId) => productId.toHexString()),
    provenance:
      document.provenance.kind === "commercial_event"
        ? {
            kind: "commercial_event",
            commercialEventId:
              document.provenance.commercialEventId.toHexString(),
          }
        : { kind: "manual" },
    recordedAt: document.recordedAt.toISOString(),
  });
}

function toWeatherObservation(
  document: WithId<WeatherObservationDocument>,
): WeatherObservation {
  const { _id, ...value } = document;
  return weatherObservationSchema.parse({
    ...value,
    id: _id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    recordedAt: document.recordedAt.toISOString(),
  });
}

export class ContextObservationRepository {
  private readonly promotions;
  private readonly weather;
  private readonly commands;
  private readonly products;
  private readonly departments;
  private readonly stores;
  private readonly commercialEvents;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.promotions = db.collection<PromotionObservationDocument>(
      "promotionContextObservations",
    );
    this.weather = db.collection<WeatherObservationDocument>(
      "weatherContextObservations",
    );
    this.commands = db.collection<ContextObservationCommandDocument>(
      "contextObservationCommands",
    );
    this.products = db.collection<ProductReferenceDocument>("products");
    this.departments =
      db.collection<DepartmentReferenceDocument>("departments");
    this.stores = db.collection<StoreReferenceDocument>("stores");
    this.commercialEvents =
      db.collection<CommercialEventReferenceDocument>("commercialEvents");
    this.auditLogs = db.collection("auditLogs");
  }

  async requireProduct(
    context: AuthorizedStoreContext,
    productId: string | undefined,
  ): Promise<string | null> {
    if (!productId) return null;
    const scope = buildContextObservationScope(context);
    const product = await this.products.findOne(
      {
        _id: new ObjectId(productId),
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        active: true,
      },
      { projection: { _id: 1 } },
    );
    if (!product) {
      throw new ContextObservationReferenceError(
        "Le produit n’appartient pas au magasin autorisé",
      );
    }
    return productId;
  }

  async listPromotions(input: {
    context: AuthorizedStoreContext;
    from: string;
    to: string;
    productId: string | null;
  }): Promise<PromotionObservation[]> {
    const scope = buildContextObservationScope(input.context);
    const documents = await this.promotions
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        businessDate: { $gte: input.from, $lte: input.to },
        ...(input.productId
          ? {
              $or: [
                { state: "none" as const },
                { productIds: new ObjectId(input.productId) },
              ],
            }
          : {}),
      })
      .sort({ businessDate: 1, recordedAt: 1, _id: 1 })
      .limit(5_000)
      .toArray();
    return documents.map(toPromotionObservation);
  }

  async listWeather(input: {
    context: AuthorizedStoreContext;
    from: string;
    to: string;
  }): Promise<WeatherObservation[]> {
    const scope = buildContextObservationScope(input.context);
    const documents = await this.weather
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        businessDate: { $gte: input.from, $lte: input.to },
      })
      .sort({ businessDate: 1, recordedAt: 1, _id: 1 })
      .limit(5_000)
      .toArray();
    return documents.map(toWeatherObservation);
  }

  async getDataRevision(context: AuthorizedStoreContext): Promise<number> {
    const scope = buildContextObservationScope(context);
    const store = await this.stores.findOne(
      {
        _id: new ObjectId(scope.storeId),
        organizationId: scope.organizationId,
        active: true,
      },
      { projection: { dataRevision: 1 } },
    );
    if (!store) {
      throw new ContextObservationReferenceError(
        "Le magasin autorisé n’est plus disponible",
      );
    }
    return store.dataRevision;
  }

  async createPromotion(input: {
    context: AuthorizedStoreContext;
    createInput: PromotionObservationCreateInput;
    requestId: string;
  }): Promise<PromotionObservation> {
    const { context, createInput, requestId } = input;
    const scope = buildContextObservationScope(context);
    const storeId = new ObjectId(scope.storeId);
    const duplicate = await this.findCommand(
      scope.organizationId,
      storeId,
      createInput.idempotencyKey,
    );
    if (duplicate) return this.promotionFromCommand(duplicate);
    if (!this.client) throw new Error("Client MongoDB requis pour cette opération");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const department = await this.departments.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            key: "fruit_vegetable",
            active: true,
          },
          { projection: { _id: 1 }, session },
        );
        const store = await this.stores.findOne(
          {
            _id: storeId,
            organizationId: scope.organizationId,
            active: true,
          },
          { projection: { _id: 1 }, session },
        );
        const products = await this.products
          .find(
            {
              _id: {
                $in: createInput.productIds.map(
                  (productId) => new ObjectId(productId),
                ),
              },
              organizationId: scope.organizationId,
              storeId,
              active: true,
            },
            { projection: { _id: 1 }, session },
          )
          .toArray();
        if (!department || !store) {
          throw new ContextObservationReferenceError(
            "Le rayon ou le magasin n’est pas disponible",
          );
        }
        if (products.length !== createInput.productIds.length) {
          throw new ContextObservationReferenceError(
            "Un produit n’appartient pas au magasin autorisé",
          );
        }

        if (createInput.provenance.kind === "commercial_event") {
          const event = await this.commercialEvents.findOne(
            {
              _id: new ObjectId(createInput.provenance.commercialEventId),
              organizationId: scope.organizationId,
              storeId,
              status: { $in: ["published", "completed"] },
            },
            { session },
          );
          const eventProducts = new Set(
            event?.productIds.map((productId) => productId.toHexString()) ?? [],
          );
          if (
            !event ||
            createInput.businessDate < event.startsOn ||
            createInput.businessDate > event.endsOn ||
            createInput.productIds.some(
              (productId) => !eventProducts.has(productId),
            )
          ) {
            throw new ContextObservationReferenceError(
              "L’opération commerciale liée ne couvre pas cette date et ces produits",
            );
          }
        }

        const now = new Date();
        const observationId = new ObjectId();
        const observation = promotionObservationSchema.parse({
          id: observationId.toHexString(),
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          departmentId: department._id.toHexString(),
          businessDate: createInput.businessDate,
          state: createInput.state,
          productIds: createInput.productIds,
          mechanic: createInput.mechanic,
          label: createInput.label,
          discountRate: createInput.discountRate,
          provenance: createInput.provenance,
          notes: createInput.notes,
          recordedBy: context.userId,
          recordedAt: now.toISOString(),
        });
        const provenance: StoredPromotionProvenance =
          observation.provenance.kind === "commercial_event"
            ? {
                kind: "commercial_event",
                commercialEventId: new ObjectId(
                  observation.provenance.commercialEventId,
                ),
              }
            : { kind: "manual" };
        await this.promotions.insertOne(
          {
            _id: observationId,
            organizationId: observation.organizationId,
            storeId,
            departmentId: department._id,
            businessDate: observation.businessDate,
            state: observation.state,
            productIds: observation.productIds.map(
              (productId) => new ObjectId(productId),
            ),
            mechanic: observation.mechanic,
            label: observation.label,
            discountRate: observation.discountRate,
            provenance,
            notes: observation.notes,
            recordedBy: observation.recordedBy,
            recordedAt: now,
          },
          { session },
        );
        await this.recordCommandAndAudit({
          context,
          idempotencyKey: createInput.idempotencyKey,
          kind: "promotion",
          observationId,
          observation,
          requestId,
          now,
          session,
        });
        return observation;
      });
      if (!result) throw new Error("L’observation promotionnelle n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await this.findCommand(
          scope.organizationId,
          storeId,
          createInput.idempotencyKey,
        );
        if (existing) return this.promotionFromCommand(existing);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async createWeather(input: {
    context: AuthorizedStoreContext;
    createInput: WeatherObservationCreateInput;
    requestId: string;
  }): Promise<WeatherObservation> {
    const { context, createInput, requestId } = input;
    const scope = buildContextObservationScope(context);
    const storeId = new ObjectId(scope.storeId);
    const duplicate = await this.findCommand(
      scope.organizationId,
      storeId,
      createInput.idempotencyKey,
    );
    if (duplicate) return this.weatherFromCommand(duplicate);
    if (!this.client) throw new Error("Client MongoDB requis pour cette opération");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const department = await this.departments.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            key: "fruit_vegetable",
            active: true,
          },
          { projection: { _id: 1 }, session },
        );
        const store = await this.stores.findOne(
          {
            _id: storeId,
            organizationId: scope.organizationId,
            active: true,
          },
          { projection: { _id: 1 }, session },
        );
        if (!department || !store) {
          throw new ContextObservationReferenceError(
            "Le rayon ou le magasin n’est pas disponible",
          );
        }

        const now = new Date();
        const observationId = new ObjectId();
        const observation = weatherObservationSchema.parse({
          id: observationId.toHexString(),
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          departmentId: department._id.toHexString(),
          businessDate: createInput.businessDate,
          condition: createInput.condition,
          minimumTemperatureC: createInput.minimumTemperatureC,
          maximumTemperatureC: createInput.maximumTemperatureC,
          precipitationMm: createInput.precipitationMm,
          provenance: createInput.provenance,
          notes: createInput.notes,
          recordedBy: context.userId,
          recordedAt: now.toISOString(),
        });
        await this.weather.insertOne(
          {
            _id: observationId,
            organizationId: observation.organizationId,
            storeId,
            departmentId: department._id,
            businessDate: observation.businessDate,
            condition: observation.condition,
            minimumTemperatureC: observation.minimumTemperatureC,
            maximumTemperatureC: observation.maximumTemperatureC,
            precipitationMm: observation.precipitationMm,
            provenance: observation.provenance,
            notes: observation.notes,
            recordedBy: observation.recordedBy,
            recordedAt: now,
          },
          { session },
        );
        await this.recordCommandAndAudit({
          context,
          idempotencyKey: createInput.idempotencyKey,
          kind: "weather",
          observationId,
          observation,
          requestId,
          now,
          session,
        });
        return observation;
      });
      if (!result) throw new Error("L’observation météo n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await this.findCommand(
          scope.organizationId,
          storeId,
          createInput.idempotencyKey,
        );
        if (existing) return this.weatherFromCommand(existing);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async findCommand(
    organizationId: string,
    storeId: ObjectId,
    idempotencyKey: string,
  ) {
    return this.commands.findOne({ organizationId, storeId, idempotencyKey });
  }

  private promotionFromCommand(
    command: WithId<ContextObservationCommandDocument>,
  ): PromotionObservation {
    if (command.kind !== "promotion") throw new ContextObservationConflictError();
    return promotionObservationSchema.parse(command.snapshot);
  }

  private weatherFromCommand(
    command: WithId<ContextObservationCommandDocument>,
  ): WeatherObservation {
    if (command.kind !== "weather") throw new ContextObservationConflictError();
    return weatherObservationSchema.parse(command.snapshot);
  }

  private async recordCommandAndAudit(input: {
    context: AuthorizedStoreContext;
    idempotencyKey: string;
    kind: "promotion" | "weather";
    observationId: ObjectId;
    observation: PromotionObservation | WeatherObservation;
    requestId: string;
    now: Date;
    session: ReturnType<MongoClient["startSession"]>;
  }): Promise<void> {
    const storeId = new ObjectId(input.context.storeId);
    await this.commands.insertOne(
      {
        organizationId: input.context.organizationId,
        storeId,
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        observationId: input.observationId,
        snapshot: input.observation,
        createdAt: input.now,
      },
      { session: input.session },
    );
    await this.stores.updateOne(
      {
        _id: storeId,
        organizationId: input.context.organizationId,
        active: true,
      },
      { $inc: { dataRevision: 1 } },
      { session: input.session },
    );
    await this.auditLogs.insertOne(
      {
        organizationId: input.context.organizationId,
        storeId,
        actorId: input.context.userId,
        action: `context.${input.kind}.observed`,
        entityType: `${input.kind}_context_observation`,
        entityId: input.observationId,
        before: null,
        after: input.observation,
        requestId: input.requestId,
        timestamp: input.now,
        createdAt: input.now,
      },
      { session: input.session },
    );
  }
}
