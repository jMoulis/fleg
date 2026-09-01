import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type ClientSession,
  type WithId,
} from "mongodb";

import {
  commercialEventSchema,
  type CommercialEvent,
  type CommercialEventCreateInput,
  type CommercialEventUpdateInput,
} from "@/domain/commercial-events/schemas";
import { resolveCommercialEventStatus } from "@/domain/commercial-events/lifecycle";
import { buildCommercialEventScope } from "@/domain/commercial-events/store-scope";
import {
  layoutVersionSchema,
  type LayoutVersion,
} from "@/domain/space/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface CommercialEventDocument
  extends Omit<
    CommercialEvent,
    | "id"
    | "storeId"
    | "departmentId"
    | "layoutVersionId"
    | "productIds"
    | "createdAt"
    | "updatedAt"
    | "publishedAt"
    | "completedAt"
    | "cancelledAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  layoutVersionId: ObjectId;
  productIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

interface CommercialEventCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  eventId: ObjectId;
  snapshot: CommercialEvent;
  createdAt: Date;
}

interface LayoutVersionDocument {
  organizationId: string;
  storeId: ObjectId;
  departmentId: ObjectId;
  departmentKey: "fruit_vegetable";
  version: number;
  createdAt: Date;
  [key: string]: unknown;
}

export class CommercialEventConflictError extends Error {
  readonly code = "COMMERCIAL_EVENT_CONFLICT";

  constructor(message = "L'opération commerciale a changé") {
    super(message);
    this.name = "CommercialEventConflictError";
  }
}

export class CommercialEventScheduleConflictError extends Error {
  readonly code = "COMMERCIAL_EVENT_SCHEDULE_CONFLICT";

  constructor() {
    super("Une autre opération occupe déjà cette TG sur ces dates");
    this.name = "CommercialEventScheduleConflictError";
  }
}

export class InvalidCommercialEventReferenceError extends Error {
  readonly code = "INVALID_COMMERCIAL_EVENT_REFERENCE";

  constructor(message: string) {
    super(message);
    this.name = "InvalidCommercialEventReferenceError";
  }
}

function toCommercialEvent(
  document: WithId<CommercialEventDocument>,
): CommercialEvent {
  return commercialEventSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    layoutVersionId: document.layoutVersionId.toHexString(),
    productIds: document.productIds.map((productId) =>
      productId.toHexString(),
    ),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    publishedAt: document.publishedAt?.toISOString() ?? null,
    completedAt: document.completedAt?.toISOString() ?? null,
    cancelledAt: document.cancelledAt?.toISOString() ?? null,
  });
}

function toLayoutVersion(
  document: WithId<LayoutVersionDocument>,
): LayoutVersion {
  return layoutVersionSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    createdAt: document.createdAt.toISOString(),
  });
}

export class CommercialEventRepository {
  private readonly commercialEvents;
  private readonly commands;
  private readonly layoutVersions;
  private readonly products;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.commercialEvents =
      db.collection<CommercialEventDocument>("commercialEvents");
    this.commands = db.collection<CommercialEventCommandDocument>(
      "commercialEventCommands",
    );
    this.layoutVersions = db.collection<LayoutVersionDocument>("layoutVersions");
    this.products = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      active: boolean;
    }>("products");
    this.auditLogs = db.collection("auditLogs");
  }

  async listForStore(
    context: AuthorizedStoreContext,
  ): Promise<CommercialEvent[]> {
    const scope = buildCommercialEventScope(context);
    const events = await this.commercialEvents
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
      })
      .sort({ startsOn: 1, fixtureName: 1 })
      .limit(500)
      .toArray();

    return events.map(toCommercialEvent);
  }

  async create(input: {
    context: AuthorizedStoreContext;
    createInput: CommercialEventCreateInput;
    requestId: string;
  }): Promise<CommercialEvent> {
    const { context, createInput, requestId } = input;
    const duplicate = await this.findCommand(
      context,
      createInput.idempotencyKey,
    );

    if (duplicate) {
      return commercialEventSchema.parse(duplicate.snapshot);
    }

    if (!this.client) {
      throw new Error("Client Mongo requis pour créer une opération commerciale");
    }

    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const references = await this.validateReferences({
          context,
          layoutVersionId: createInput.layoutVersionId,
          fixtureId: createInput.fixtureId,
          productIds: createInput.productIds,
          session,
        });
        await this.assertNoScheduleConflict({
          context,
          fixtureId: createInput.fixtureId,
          startsOn: createInput.startsOn,
          endsOn: createInput.endsOn,
          session,
        });
        const status = resolveCommercialEventStatus({
          currentStatus: null,
          action: createInput.action,
        });

        if (!status) {
          throw new InvalidCommercialEventReferenceError(
            "Transition d'opération invalide",
          );
        }

        const now = new Date();
        const eventId = new ObjectId();
        const event = commercialEventSchema.parse({
          id: eventId.toHexString(),
          organizationId: context.organizationId,
          storeId: context.storeId,
          departmentId: references.layout.departmentId,
          layoutVersionId: references.layout.id,
          fixtureId: references.fixture.id,
          fixtureName: references.fixture.name,
          title: createInput.title,
          theme: createInput.theme,
          startsOn: createInput.startsOn,
          endsOn: createInput.endsOn,
          productIds: createInput.productIds,
          targetRevenueCents: createInput.targetRevenueCents,
          targetMarginCents: createInput.targetMarginCents,
          actualRevenueCents: null,
          actualMarginCents: null,
          notes: createInput.notes?.trim() || null,
          status,
          createdBy: context.userId,
          publishedBy: status === "published" ? context.userId : null,
          completedBy: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          publishedAt: status === "published" ? now.toISOString() : null,
          completedAt: null,
          cancelledAt: null,
        });

        await this.commercialEvents.insertOne(
          this.toDocument(eventId, event),
          { session },
        );
        await this.recordCommand({
          context,
          idempotencyKey: createInput.idempotencyKey,
          eventId,
          snapshot: event,
          now,
          session,
        });
        await this.auditLogs.insertOne(
          {
            organizationId: context.organizationId,
            storeId: new ObjectId(context.storeId),
            actorId: context.userId,
            action: `commercial_event.${status === "published" ? "published" : "created"}`,
            entityType: "commercialEvent",
            entityId: eventId,
            before: null,
            after: event,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );

        return event;
      });

      if (!result) {
        throw new Error("L'opération commerciale n'a pas été créée");
      }

      return result;
    } catch (error) {
      return this.handleDuplicateCommand(error, context, createInput.idempotencyKey);
    } finally {
      await session.endSession();
    }
  }

  async update(input: {
    context: AuthorizedStoreContext;
    eventId: string;
    updateInput: CommercialEventUpdateInput;
    requestId: string;
  }): Promise<CommercialEvent> {
    const { context, eventId, updateInput, requestId } = input;
    const duplicate = await this.findCommand(context, updateInput.idempotencyKey);

    if (duplicate) {
      return commercialEventSchema.parse(duplicate.snapshot);
    }

    if (!this.client) {
      throw new Error("Client Mongo requis pour modifier une opération commerciale");
    }

    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const scope = buildCommercialEventScope(context);
        const objectId = new ObjectId(eventId);
        const currentDocument = await this.commercialEvents.findOne(
          {
            _id: objectId,
            organizationId: scope.organizationId,
            storeId: new ObjectId(scope.storeId),
          },
          { session },
        );

        if (!currentDocument) {
          throw new InvalidCommercialEventReferenceError(
            "Opération introuvable ou accès refusé",
          );
        }

        const current = toCommercialEvent(currentDocument);
        if (current.updatedAt !== updateInput.basedOnUpdatedAt) {
          throw new CommercialEventConflictError();
        }

        const status = resolveCommercialEventStatus({
          currentStatus: current.status,
          action: updateInput.action,
        });
        if (!status) {
          throw new CommercialEventConflictError(
            "Cette opération ne peut plus effectuer cette transition",
          );
        }

        const remainsEditable =
          updateInput.action === "save" || updateInput.action === "publish";
        const references = remainsEditable
          ? await this.validateReferences({
              context,
              layoutVersionId: updateInput.layoutVersionId,
              fixtureId: updateInput.fixtureId,
              productIds: updateInput.productIds,
              session,
            })
          : null;
        if (remainsEditable) {
          await this.assertNoScheduleConflict({
            context,
            fixtureId: updateInput.fixtureId,
            startsOn: updateInput.startsOn,
            endsOn: updateInput.endsOn,
            excludedEventId: objectId,
            session,
          });
        }

        const now = new Date();
        const event = commercialEventSchema.parse({
          ...current,
          layoutVersionId: references?.layout.id ?? current.layoutVersionId,
          departmentId: references?.layout.departmentId ?? current.departmentId,
          fixtureId: references?.fixture.id ?? current.fixtureId,
          fixtureName: references?.fixture.name ?? current.fixtureName,
          title: remainsEditable ? updateInput.title : current.title,
          theme: remainsEditable ? updateInput.theme : current.theme,
          startsOn: remainsEditable ? updateInput.startsOn : current.startsOn,
          endsOn: remainsEditable ? updateInput.endsOn : current.endsOn,
          productIds: remainsEditable ? updateInput.productIds : current.productIds,
          targetRevenueCents: remainsEditable
            ? updateInput.targetRevenueCents
            : current.targetRevenueCents,
          targetMarginCents: remainsEditable
            ? updateInput.targetMarginCents
            : current.targetMarginCents,
          actualRevenueCents:
            status === "completed" ? updateInput.actualRevenueCents : null,
          actualMarginCents:
            status === "completed" ? updateInput.actualMarginCents : null,
          notes:
            updateInput.action === "complete" || remainsEditable
              ? updateInput.notes?.trim() || null
              : current.notes,
          status,
          publishedBy:
            status === "published"
              ? (current.publishedBy ?? context.userId)
              : current.publishedBy,
          completedBy:
            status === "completed" ? context.userId : current.completedBy,
          updatedAt: now.toISOString(),
          publishedAt:
            status === "published"
              ? (current.publishedAt ?? now.toISOString())
              : current.publishedAt,
          completedAt:
            status === "completed" ? now.toISOString() : current.completedAt,
          cancelledAt:
            status === "cancelled" ? now.toISOString() : current.cancelledAt,
        });

        const replacement = this.toDocument(objectId, event);
        const updateResult = await this.commercialEvents.replaceOne(
          {
            _id: objectId,
            updatedAt: currentDocument.updatedAt,
          },
          replacement,
          { session },
        );

        if (updateResult.modifiedCount !== 1) {
          throw new CommercialEventConflictError();
        }

        await this.recordCommand({
          context,
          idempotencyKey: updateInput.idempotencyKey,
          eventId: objectId,
          snapshot: event,
          now,
          session,
        });
        await this.auditLogs.insertOne(
          {
            organizationId: context.organizationId,
            storeId: new ObjectId(context.storeId),
            actorId: context.userId,
            action: `commercial_event.${
              updateInput.action === "save"
                ? "updated"
                : updateInput.action === "publish"
                  ? "published"
                  : updateInput.action === "complete"
                    ? "completed"
                    : "cancelled"
            }`,
            entityType: "commercialEvent",
            entityId: objectId,
            before: current,
            after: event,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );

        return event;
      });

      if (!result) {
        throw new Error("L'opération commerciale n'a pas été modifiée");
      }

      return result;
    } catch (error) {
      return this.handleDuplicateCommand(error, context, updateInput.idempotencyKey);
    } finally {
      await session.endSession();
    }
  }

  private async validateReferences(input: {
    context: AuthorizedStoreContext;
    layoutVersionId: string;
    fixtureId: string;
    productIds: string[];
    session: ClientSession;
  }) {
    const storeId = new ObjectId(input.context.storeId);
    const latestLayoutDocument = await this.layoutVersions.findOne(
      {
        organizationId: input.context.organizationId,
        storeId,
        departmentKey: "fruit_vegetable",
      },
      { sort: { version: -1, createdAt: -1 }, session: input.session },
    );

    if (
      !latestLayoutDocument ||
      latestLayoutDocument._id.toHexString() !== input.layoutVersionId
    ) {
      throw new CommercialEventConflictError(
        "Le plan magasin a changé, rechargez le calendrier",
      );
    }

    const layout = toLayoutVersion(latestLayoutDocument);
    const fixture = layout.fixtures.find(
      (candidate) =>
        candidate.id === input.fixtureId && candidate.type === "endcap",
    );

    if (!fixture) {
      throw new InvalidCommercialEventReferenceError(
        "La tête de gondole n'appartient pas au plan courant",
      );
    }

    const productObjectIds = input.productIds.map((id) => new ObjectId(id));
    const productCount = await this.products.countDocuments(
      {
        _id: { $in: productObjectIds },
        organizationId: input.context.organizationId,
        storeId,
        active: true,
      },
      { session: input.session },
    );

    if (productCount !== new Set(input.productIds).size) {
      throw new InvalidCommercialEventReferenceError(
        "Un produit n'appartient pas à ce magasin",
      );
    }

    return { layout, fixture };
  }

  private async assertNoScheduleConflict(input: {
    context: AuthorizedStoreContext;
    fixtureId: string;
    startsOn: string;
    endsOn: string;
    excludedEventId?: ObjectId;
    session: ClientSession;
  }) {
    const conflicting = await this.commercialEvents.findOne(
      {
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        fixtureId: input.fixtureId,
        status: { $ne: "cancelled" },
        startsOn: { $lte: input.endsOn },
        endsOn: { $gte: input.startsOn },
        ...(input.excludedEventId
          ? { _id: { $ne: input.excludedEventId } }
          : {}),
      },
      { projection: { _id: 1 }, session: input.session },
    );

    if (conflicting) {
      throw new CommercialEventScheduleConflictError();
    }
  }

  private toDocument(
    eventId: ObjectId,
    event: CommercialEvent,
  ): WithId<CommercialEventDocument> {
    return {
      _id: eventId,
      organizationId: event.organizationId,
      storeId: new ObjectId(event.storeId),
      departmentId: new ObjectId(event.departmentId),
      layoutVersionId: new ObjectId(event.layoutVersionId),
      fixtureId: event.fixtureId,
      fixtureName: event.fixtureName,
      title: event.title,
      theme: event.theme,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      productIds: event.productIds.map((productId) => new ObjectId(productId)),
      targetRevenueCents: event.targetRevenueCents,
      targetMarginCents: event.targetMarginCents,
      actualRevenueCents: event.actualRevenueCents,
      actualMarginCents: event.actualMarginCents,
      notes: event.notes,
      status: event.status,
      createdBy: event.createdBy,
      publishedBy: event.publishedBy,
      completedBy: event.completedBy,
      createdAt: new Date(event.createdAt),
      updatedAt: new Date(event.updatedAt),
      publishedAt: event.publishedAt ? new Date(event.publishedAt) : null,
      completedAt: event.completedAt ? new Date(event.completedAt) : null,
      cancelledAt: event.cancelledAt ? new Date(event.cancelledAt) : null,
    };
  }

  private async findCommand(
    context: AuthorizedStoreContext,
    idempotencyKey: string,
  ) {
    return this.commands.findOne({
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      idempotencyKey,
    });
  }

  private async recordCommand(input: {
    context: AuthorizedStoreContext;
    idempotencyKey: string;
    eventId: ObjectId;
    snapshot: CommercialEvent;
    now: Date;
    session: ClientSession;
  }) {
    await this.commands.insertOne(
      {
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        idempotencyKey: input.idempotencyKey,
        eventId: input.eventId,
        snapshot: input.snapshot,
        createdAt: input.now,
      },
      { session: input.session },
    );
  }

  private async handleDuplicateCommand(
    error: unknown,
    context: AuthorizedStoreContext,
    idempotencyKey: string,
  ): Promise<CommercialEvent> {
    if (error instanceof MongoServerError && error.code === 11000) {
      const duplicate = await this.findCommand(context, idempotencyKey);
      if (duplicate) {
        return commercialEventSchema.parse(duplicate.snapshot);
      }
    }

    throw error;
  }
}
