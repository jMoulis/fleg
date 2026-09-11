import "server-only";
import { createHash } from "node:crypto";
import { MongoServerError, ObjectId, type Db, type MongoClient } from "mongodb";
import {
  inventorySyncInputSchema,
  syncReceiptSchema,
  type InventorySyncInput,
  type SyncReceipt,
} from "@/domain/offline/sync";
import { businessTimeZoneSchema } from "@/domain/offline/schemas";
import type { InventoryCount } from "@/domain/inventory/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  InventoryConflictError,
  InventoryReferenceError,
  toInventoryCount,
  type InventoryCountDocument,
} from "./inventory-repository";

export class InventorySyncConflict extends InventoryConflictError {
  constructor(readonly current: InventoryCount | null) {
    super(
      current?.status === "committed"
        ? "Le comptage serveur est validé. Créez une correction dans Stocks du matin, puis actualisez ici."
        : "Le comptage serveur a changé. Comparez les valeurs avant de poursuivre.",
    );
  }
}
interface ReceiptDocument {
  _id: string;
  organizationId: string;
  storeId: ObjectId;
  userId: string;
  payloadHash: string;
  receipt: SyncReceipt;
  createdAt: Date;
}

export class InventorySyncRepository {
  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
  ) {}

  async current(context: AuthorizedStoreContext, businessDate: string) {
    const doc = await this.db
      .collection<InventoryCountDocument>("inventoryCounts")
      .findOne(
        {
          organizationId: context.organizationId,
          storeId: new ObjectId(context.storeId),
          businessDate,
        },
        { sort: { version: -1 } },
      );
    return doc ? toInventoryCount(doc) : null;
  }

  async apply(
    context: AuthorizedStoreContext,
    value: InventorySyncInput,
    requestId: string,
  ) {
    const input = inventorySyncInputSchema.parse(value);
    if (
      !context.permissions.includes("inventory.write") ||
      input.owner.userId !== context.userId ||
      input.owner.organizationId !== context.organizationId ||
      input.owner.storeId !== context.storeId
    )
      throw new StoreAccessDeniedError();
    const scope = {
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
    };
    const commands = this.db.collection<ReceiptDocument>(
      "inventorySyncCommands",
    );
    // Implicit unique _id index includes the authorized scope/actor. No growing snapshots per retry.
    const commandId = createHash("sha256")
      .update(
        JSON.stringify([
          context.organizationId,
          context.storeId,
          context.userId,
          input.operationId,
        ]),
      )
      .digest("hex");
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const filter = { ...scope, userId: context.userId, _id: commandId };
    const readReceipt = (document: ReceiptDocument) => {
      if (document.payloadHash !== payloadHash)
        throw new InventoryConflictError(
          "Cet identifiant d’opération désigne déjà un autre contenu. Aucun remplacement effectué.",
        );
      return syncReceiptSchema.parse(document.receipt);
    };
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await commands.findOne(filter, { session });
        if (repeated) return readReceipt(repeated);
        const store = await this.db
          .collection<{
            organizationId: string;
            active: boolean;
            timeZone?: string;
          }>("stores")
          .findOne(
            {
              _id: scope.storeId,
              organizationId: scope.organizationId,
              active: true,
            },
            { session },
          );
        if (!store) throw new StoreAccessDeniedError();
        if (
          businessTimeZoneSchema.parse(store.timeZone ?? "Europe/Paris") !==
          input.timeZone
        )
          throw new InventoryReferenceError(
            "Le fuseau du magasin a changé ; vérifiez le relevé avant synchronisation.",
          );
        const now = new Date();
        if (
          Date.parse(input.createdAt) > now.getTime() ||
          input.lines.some(
            (line) =>
              line.observedAt && Date.parse(line.observedAt) > now.getTime(),
          )
        )
          throw new InventoryReferenceError(
            "Horloge de l’appareil dans le futur : corrigez-la avant de réessayer.",
          );
        const counts =
          this.db.collection<InventoryCountDocument>("inventoryCounts");
        const current = await counts.findOne(
          { ...scope, businessDate: input.businessDate },
          { sort: { version: -1 }, session },
        );
        if (
          (current?._id.toHexString() ?? null) !== input.baseCountId ||
          (current?.revision ?? null) !== input.basedOnRevision ||
          current?.status === "committed"
        )
          throw new InventorySyncConflict(
            current ? toInventoryCount(current) : null,
          );
        const productIds = input.lines.map(
          (line) => new ObjectId(line.productId),
        );
        const productCount = await this.db
          .collection("products")
          .countDocuments(
            { ...scope, _id: { $in: productIds }, active: true },
            { session },
          );
        if (productCount !== productIds.length)
          throw new InventoryReferenceError(
            "Un article n’appartient plus au magasin autorisé",
          );
        const linesById = new Map(
          current?.lines.map((line) => [line.productId.toHexString(), line]),
        );
        for (const line of input.lines)
          linesById.set(new ObjectId(line.productId).toHexString(), {
            ...line,
            productId: new ObjectId(line.productId),
          });
        if (linesById.size > 2000)
          throw new InventoryReferenceError(
            "Le comptage dépasse 2 000 articles",
          );
        const countId = current?._id ?? new ObjectId();
        const revision = (current?.revision ?? 0) + 1;
        if (current) {
          const saved = await counts.updateOne(
            {
              ...scope,
              _id: countId,
              status: "draft",
              revision: current.revision,
            },
            {
              $set: {
                lines: [...linesById.values()],
                revision,
                updatedAt: now,
                updatedBy: context.userId,
              },
            },
            { session },
          );
          if (saved.matchedCount !== 1)
            throw new InventorySyncConflict(toInventoryCount(current));
        } else {
          await counts.insertOne(
            {
              _id: countId,
              ...scope,
              businessDate: input.businessDate,
              version: 1,
              revision,
              status: "draft",
              lines: [...linesById.values()],
              supersedesCountId: null,
              createdAt: now,
              updatedAt: now,
              createdBy: context.userId,
              updatedBy: context.userId,
              committedAt: null,
              committedBy: null,
            },
            { session },
          );
        }
        const receipt = syncReceiptSchema.parse({
          kind: "acknowledged",
          operationId: input.operationId,
          draftId: input.draftId,
          owner: input.owner,
          businessDate: input.businessDate,
          countId: countId.toHexString(),
          revision,
          receivedAt: now.toISOString(),
        });
        await commands.insertOne(
          { ...filter, payloadHash, receipt, createdAt: now },
          { session },
        );
        await this.db.collection("auditLogs").insertOne(
          {
            ...scope,
            actorId: context.userId,
            action: "inventory.count.offline_synchronized",
            entityType: "inventoryCount",
            entityId: countId,
            before: { revision: current?.revision ?? null },
            after: {
              revision,
              businessDate: input.businessDate,
              localDraftId: input.draftId,
              operationId: input.operationId,
              payloadHash,
              lines: input.lines,
            },
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        return receipt;
      });
      if (!result) throw new Error("Accusé de réception absent");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await commands.findOne(filter);
        if (repeated) return readReceipt(repeated);
        throw new InventorySyncConflict(
          await this.current(context, input.businessDate),
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
