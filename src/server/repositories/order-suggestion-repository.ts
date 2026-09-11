import "server-only";

import {
  type Db,
  type MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  orderSuggestionDraftSchema,
  type OrderSuggestionApprovalInput,
  type OrderSuggestionDraft,
} from "@/domain/ordering/schemas";
import { buildOrderSuggestionScope } from "@/domain/ordering/store-scope";
import { orderEvidenceReference, verifyOrderEvidence } from "@/domain/ordering/evidence";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

type StoredDecision = Omit<
  NonNullable<OrderSuggestionDraft["decision"]>,
  "approvedAt"
> & { approvedAt: Date };

interface OrderSuggestionDocument
  extends Omit<
    OrderSuggestionDraft,
    "id" | "storeId" | "generatedAt" | "decision"
  > {
  storeId: ObjectId;
  generatedAt: Date;
  decision: StoredDecision | null;
}

interface OrderSuggestionCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  operation: "create" | "approve";
  suggestionId: ObjectId;
  snapshot?: OrderSuggestionDraft;
  evidence?: ReturnType<typeof orderEvidenceReference>;
  createdAt: Date;
}

interface StoreReferenceDocument {
  organizationId: string;
  active: boolean;
  dataRevision: number;
}

export class OrderSuggestionNotFoundError extends Error {
  constructor() {
    super("Proposition de commande introuvable ou accès refusé");
    this.name = "OrderSuggestionNotFoundError";
  }
}

export class OrderSuggestionConflictError extends Error {
  constructor(message = "La proposition de commande a déjà changé") {
    super(message);
    this.name = "OrderSuggestionConflictError";
  }
}

export class OrderSuggestionInputChangedError extends Error {
  constructor() {
    super(
      "Les données magasin ont changé pendant le calcul ; préparez une nouvelle proposition",
    );
    this.name = "OrderSuggestionInputChangedError";
  }
}

export class OrderSuggestionDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderSuggestionDecisionError";
  }
}

function toOrderSuggestion(
  document: WithId<OrderSuggestionDocument>,
): OrderSuggestionDraft {
  const { _id, ...value } = document;
  return orderSuggestionDraftSchema.parse({
    ...value,
    id: _id.toHexString(),
    storeId: document.storeId.toHexString(),
    generatedAt: document.generatedAt.toISOString(),
    decision: document.decision
      ? {
          ...document.decision,
          approvedAt: document.decision.approvedAt.toISOString(),
        }
      : null,
  });
}

function toDocument(suggestion: OrderSuggestionDraft): OrderSuggestionDocument {
  const { id: ignoredId, storeId, generatedAt, decision, ...value } = suggestion;
  void ignoredId;
  return {
    ...value,
    storeId: new ObjectId(storeId),
    generatedAt: new Date(generatedAt),
    decision: decision
      ? { ...decision, approvedAt: new Date(decision.approvedAt) }
      : null,
  };
}

export class OrderSuggestionRepository {
  private readonly suggestions;
  private readonly commands;
  private readonly stores;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.suggestions =
      db.collection<OrderSuggestionDocument>("orderSuggestionDrafts");
    this.commands =
      db.collection<OrderSuggestionCommandDocument>("orderSuggestionCommands");
    this.stores = db.collection<StoreReferenceDocument>("stores");
    this.auditLogs = db.collection("auditLogs");
  }

  async findLatest(input: {
    context: AuthorizedStoreContext;
    orderDate: string;
  }): Promise<OrderSuggestionDraft | null> {
    const scope = buildOrderSuggestionScope(input.context);
    const document = await this.suggestions.findOne(
      {
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        orderDate: input.orderDate,
      },
      { sort: { generatedAt: -1, _id: -1 } },
    );
    return document ? toOrderSuggestion(document) : null;
  }

  async createDraft(input: {
    context: AuthorizedStoreContext;
    idempotencyKey: string;
    requestId: string;
    expectedDataRevision: number;
    draft: Omit<
      OrderSuggestionDraft,
      "id" | "status" | "generatedBy" | "generatedAt" | "decision"
    >;
  }): Promise<OrderSuggestionDraft> {
    const scope = buildOrderSuggestionScope(input.context);
    const storeId = new ObjectId(scope.storeId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: input.idempotencyKey,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate) return this.createFromCommand(duplicate);
    if (!this.client) {
      throw new Error("Client MongoDB requis pour créer une proposition");
    }

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, { session });
        if (repeated) return this.createFromCommand(repeated);

        const store = await this.stores.findOne(
          {
            _id: storeId,
            organizationId: scope.organizationId,
            active: true,
          },
          { projection: { dataRevision: 1 }, session },
        );
        if (!store) throw new OrderSuggestionNotFoundError();
        if (store.dataRevision !== input.expectedDataRevision) {
          throw new OrderSuggestionInputChangedError();
        }

        const now = new Date();
        const suggestionId = new ObjectId();
        const suggestion = orderSuggestionDraftSchema.parse({
          ...input.draft,
          id: suggestionId.toHexString(),
          status: "draft",
          generatedBy: input.context.userId,
          generatedAt: now.toISOString(),
          decision: null,
        });
        await this.suggestions.insertOne(
          { _id: suggestionId, ...toDocument(suggestion) },
          { session },
        );
        await this.commands.insertOne(
          {
            ...commandFilter,
            operation: "create",
            suggestionId,
            evidence: orderEvidenceReference(suggestion, "create"),
            createdAt: now,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: input.context.userId,
            action: "order_suggestion.generated",
            entityType: "orderSuggestion",
            entityId: suggestionId,
            before: null,
            after: { status: suggestion.status, evidence: orderEvidenceReference(suggestion, "create") },
            requestId: input.requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        return suggestion;
      });
      if (!result) throw new Error("La proposition n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated) return this.createFromCommand(repeated);
        throw new OrderSuggestionConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async approve(input: {
    context: AuthorizedStoreContext;
    suggestionId: string;
    approvalInput: OrderSuggestionApprovalInput;
    requestId: string;
  }): Promise<OrderSuggestionDraft> {
    const scope = buildOrderSuggestionScope(input.context);
    const storeId = new ObjectId(scope.storeId);
    const suggestionId = new ObjectId(input.suggestionId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: input.approvalInput.idempotencyKey,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate) return this.approvalFromCommand(duplicate, suggestionId);
    if (!this.client) {
      throw new Error("Client MongoDB requis pour valider une proposition");
    }

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, { session });
        if (repeated) return this.approvalFromCommand(repeated, suggestionId);

        const document = await this.suggestions.findOne(
          {
            _id: suggestionId,
            organizationId: scope.organizationId,
            storeId,
          },
          { session },
        );
        if (!document) throw new OrderSuggestionNotFoundError();
        const before = toOrderSuggestion(document);
        if (before.status !== "draft") {
          throw new OrderSuggestionConflictError(
            "Cette proposition est déjà validée",
          );
        }
        if (before.generatedAt !== input.approvalInput.basedOnGeneratedAt) {
          throw new OrderSuggestionConflictError();
        }

        const orderableLines = before.lines.filter(
          (line) =>
            line.status !== "unavailable" &&
            line.suggestedCaseCount !== null &&
            line.packSize !== null,
        );
        const approvalsByProduct = new Map(
          input.approvalInput.lines.map((line) => [line.productId, line]),
        );
        if (
          approvalsByProduct.size !== input.approvalInput.lines.length ||
          approvalsByProduct.size !== orderableLines.length ||
          orderableLines.some((line) => !approvalsByProduct.has(line.productId))
        ) {
          throw new OrderSuggestionDecisionError(
            "La décision doit couvrir exactement toutes les lignes commandables",
          );
        }

        const decisionLines = orderableLines.map((line) => {
          const approval = approvalsByProduct.get(line.productId)!;
          const overridden =
            approval.approvedCaseCount !== line.suggestedCaseCount;
          if (overridden && !approval.overrideReason) {
            throw new OrderSuggestionDecisionError(
              `Un motif est requis pour modifier ${line.productLabel}`,
            );
          }
          return {
            productId: line.productId,
            suggestedCaseCount: line.suggestedCaseCount!,
            approvedCaseCount: approval.approvedCaseCount,
            approvedOrderQuantity:
              Math.round(approval.approvedCaseCount * line.packSize! * 1_000_000) /
              1_000_000,
            overrideReason: overridden ? approval.overrideReason : null,
          };
        });
        const now = new Date();
        const after = orderSuggestionDraftSchema.parse({
          ...before,
          status: "approved",
          decision: {
            approvedBy: input.context.userId,
            approvedAt: now.toISOString(),
            note: input.approvalInput.note,
            lines: decisionLines,
          },
        });
        const update = await this.suggestions.updateOne(
          {
            _id: suggestionId,
            organizationId: scope.organizationId,
            storeId,
            status: "draft",
            generatedAt: new Date(before.generatedAt),
          },
          {
            $set: {
              status: "approved",
              decision: {
                ...after.decision!,
                approvedAt: now,
              },
            },
          },
          { session },
        );
        if (update.modifiedCount !== 1) {
          throw new OrderSuggestionConflictError();
        }
        await this.commands.insertOne(
          {
            ...commandFilter,
            operation: "approve",
            suggestionId,
            evidence: orderEvidenceReference(after, "approve"),
            createdAt: now,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: input.context.userId,
            action: "order_suggestion.approved",
            entityType: "orderSuggestion",
            entityId: suggestionId,
            before: { status: before.status, evidence: orderEvidenceReference(before, "create") },
            after: { status: after.status, decision: after.decision, evidence: orderEvidenceReference(after, "approve") },
            requestId: input.requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        return after;
      });
      if (!result) throw new Error("La validation n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated) return this.approvalFromCommand(repeated, suggestionId);
        throw new OrderSuggestionConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async createFromCommand(
    command: WithId<OrderSuggestionCommandDocument>,
  ): Promise<OrderSuggestionDraft> {
    if (command.operation !== "create") {
      throw new OrderSuggestionConflictError(
        "Cette clé d’idempotence est déjà utilisée pour une autre opération",
      );
    }
    return this.readCommandEvidence(command);
  }

  private async approvalFromCommand(
    command: WithId<OrderSuggestionCommandDocument>,
    expectedSuggestionId: ObjectId,
  ): Promise<OrderSuggestionDraft> {
    if (
      command.operation !== "approve" ||
      !command.suggestionId.equals(expectedSuggestionId)
    ) {
      throw new OrderSuggestionConflictError(
        "Cette clé d’idempotence est déjà utilisée pour une autre opération",
      );
    }
    return this.readCommandEvidence(command);
  }

  private async readCommandEvidence(command: WithId<OrderSuggestionCommandDocument>) {
    // Legacy commands remain readable during rolling deployment; no in-place
    // conversion is needed to enable compact writes for new suggestions.
    if (command.snapshot) return orderSuggestionDraftSchema.parse(command.snapshot);
    if (!command.evidence || command.evidence.view !== command.operation) {
      throw new OrderSuggestionConflictError("Preuve de commande invalide");
    }
    const canonical = await this.suggestions.findOne({
      _id: command.suggestionId,
      organizationId: command.organizationId,
      storeId: command.storeId,
    });
    if (!canonical) throw new OrderSuggestionNotFoundError();
    return verifyOrderEvidence(toOrderSuggestion(canonical), command.evidence);
  }
}
