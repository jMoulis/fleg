import "server-only";

import { randomUUID } from "node:crypto";

import { Db, MongoClient, MongoServerError, ObjectId } from "mongodb";

import {
  aiActionPlanSchema,
  assertAiActionPlanScope,
  createDraftActionPlanInputSchema,
  createDraftActionPlanResultSchema,
  type AiActionPlan,
  type AiActionPlanDecisionInput,
  type AiActionPlanGrounding,
  type CreateDraftActionPlanInput,
  type CreateDraftActionPlanResult,
} from "@/domain/ai/action-plans";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface AiActionPlanDecisionDocument {
  decision: "approved" | "rejected";
  rationale: string;
  actorUserId: string;
  decidedAt: Date;
}

interface AiActionPlanDocument
  extends Omit<
    AiActionPlan,
    "id" | "storeId" | "createdAt" | "updatedAt" | "decision"
  > {
  storeId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  decision: AiActionPlanDecisionDocument | null;
  idempotencyKey: string;
}

interface AiActionPlanDecisionLogDocument {
  entryType: "ai_action_plan";
  actionPlanId: ObjectId;
  organizationId: string;
  storeId: ObjectId;
  actorUserId: string;
  decision: "approved" | "rejected";
  rationale: string;
  actionPlanSnapshot: AiActionPlan;
  idempotencyKey: string;
  decidedAt: Date;
  createdAt: Date;
}

export class AiActionPlanNotFoundError extends Error {
  constructor() {
    super("Plan d’action introuvable ou accès refusé");
    this.name = "AiActionPlanNotFoundError";
  }
}

export class AiActionPlanAlreadyDecidedError extends Error {
  constructor() {
    super("Ce plan d’action a déjà reçu une décision");
    this.name = "AiActionPlanAlreadyDecidedError";
  }
}

function toActionPlan(
  document: AiActionPlanDocument & { _id: ObjectId },
): AiActionPlan {
  const {
    _id,
    storeId,
    createdAt,
    updatedAt,
    decision,
    idempotencyKey: _idempotencyKey,
    ...fields
  } = document;
  void _idempotencyKey;
  return aiActionPlanSchema.parse({
    ...fields,
    id: _id.toHexString(),
    storeId: storeId.toHexString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    decision: decision
      ? {
          ...decision,
          decidedAt: decision.decidedAt.toISOString(),
        }
      : null,
  });
}

export class AiActionPlanRepository {
  private readonly actionPlans;
  private readonly decisionLogs;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client: MongoClient,
  ) {
    this.actionPlans = db.collection<AiActionPlanDocument>("aiActionPlans");
    this.decisionLogs =
      db.collection<AiActionPlanDecisionLogDocument>("decisionLogs");
    this.auditLogs = db.collection("auditLogs");
  }

  async createDraft(input: {
    context: AuthorizedStoreContext;
    draft: CreateDraftActionPlanInput;
    grounding: AiActionPlanGrounding;
    sourceQuestion: string;
    model: string;
    promptVersion: string;
    idempotencyKey: string;
    requestId: string;
  }): Promise<CreateDraftActionPlanResult> {
    const { context } = input;
    const storeId = new ObjectId(context.storeId);
    const existing = await this.actionPlans.findOne({
      organizationId: context.organizationId,
      storeId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) return this.toCreationResult(context, existing);

    const draft = createDraftActionPlanInputSchema.parse(input.draft);
    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const now = new Date();
        const document: AiActionPlanDocument = {
          organizationId: context.organizationId,
          storeId,
          title: draft.title,
          objective: draft.objective,
          periodKey: draft.periodKey,
          confidence: draft.confidence,
          actions: draft.actions.map((action) => ({
            ...action,
            id: randomUUID(),
          })),
          status: "draft",
          executionStatus: "not_executed",
          evidence: input.grounding.evidence,
          semantics: input.grounding.semantics,
          limitations: input.grounding.limitations,
          sourceQuestion: input.sourceQuestion,
          model: input.model,
          promptVersion: input.promptVersion,
          createdByUserId: context.userId,
          createdAt: now,
          updatedAt: now,
          decision: null,
          idempotencyKey: input.idempotencyKey,
        };
        const inserted = await this.actionPlans.insertOne(document, { session });
        const actionPlan = toActionPlan({ ...document, _id: inserted.insertedId });

        await this.auditLogs.insertOne(
          {
            organizationId: context.organizationId,
            storeId,
            actorId: context.userId,
            action: "ai.action_plan.draft_created",
            entityType: "aiActionPlan",
            entityId: inserted.insertedId,
            before: null,
            after: actionPlan,
            requestId: input.requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );

        return createDraftActionPlanResultSchema.parse({
          tool: "createDraftActionPlan",
          readOnly: false,
          storeIds: [context.storeId],
          evidence: actionPlan.evidence,
          semantics: actionPlan.semantics,
          limitations: actionPlan.limitations,
          data: actionPlan,
        });
      });

      if (!result) throw new Error("Le brouillon n’a pas été enregistré");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const duplicate = await this.actionPlans.findOne({
          organizationId: context.organizationId,
          storeId,
          idempotencyKey: input.idempotencyKey,
        });
        if (duplicate) return this.toCreationResult(context, duplicate);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async listForStore(
    context: AuthorizedStoreContext,
    limit = 20,
  ): Promise<AiActionPlan[]> {
    const documents = await this.actionPlans
      .find({
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => {
      const actionPlan = toActionPlan(document);
      assertAiActionPlanScope(context, actionPlan);
      return actionPlan;
    });
  }

  async decide(input: {
    context: AuthorizedStoreContext;
    actionPlanId: string;
    decisionInput: AiActionPlanDecisionInput;
    requestId: string;
  }): Promise<AiActionPlan> {
    const { context, decisionInput } = input;
    const storeId = new ObjectId(context.storeId);
    const actionPlanId = new ObjectId(input.actionPlanId);
    const existingDecision = await this.decisionLogs.findOne({
      organizationId: context.organizationId,
      storeId,
      idempotencyKey: decisionInput.idempotencyKey,
    });
    if (existingDecision) {
      if (
        existingDecision.entryType !== "ai_action_plan" ||
        !existingDecision.actionPlanId?.equals(actionPlanId)
      ) {
        throw new AiActionPlanAlreadyDecidedError();
      }
      const existingPlan = await this.actionPlans.findOne({
        _id: actionPlanId,
        organizationId: context.organizationId,
        storeId,
      });
      if (!existingPlan) throw new AiActionPlanNotFoundError();
      return toActionPlan(existingPlan);
    }

    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const document = await this.actionPlans.findOne(
          {
            _id: actionPlanId,
            organizationId: context.organizationId,
            storeId,
          },
          { session },
        );
        if (!document) throw new AiActionPlanNotFoundError();
        if (document.status !== "draft") {
          throw new AiActionPlanAlreadyDecidedError();
        }

        const before = toActionPlan(document);
        const decidedAt = new Date();
        const decision: AiActionPlanDecisionDocument = {
          decision: decisionInput.decision,
          rationale: decisionInput.rationale,
          actorUserId: context.userId,
          decidedAt,
        };
        const update = await this.actionPlans.updateOne(
          {
            _id: actionPlanId,
            organizationId: context.organizationId,
            storeId,
            status: "draft",
          },
          {
            $set: {
              status: decisionInput.decision,
              decision,
              updatedAt: decidedAt,
            },
          },
          { session },
        );
        if (update.modifiedCount !== 1) {
          throw new AiActionPlanAlreadyDecidedError();
        }

        const after = toActionPlan({
          ...document,
          status: decisionInput.decision,
          decision,
          updatedAt: decidedAt,
        });
        await this.decisionLogs.insertOne(
          {
            entryType: "ai_action_plan",
            actionPlanId,
            organizationId: context.organizationId,
            storeId,
            actorUserId: context.userId,
            decision: decisionInput.decision,
            rationale: decisionInput.rationale,
            actionPlanSnapshot: before,
            idempotencyKey: decisionInput.idempotencyKey,
            decidedAt,
            createdAt: decidedAt,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: context.organizationId,
            storeId,
            actorId: context.userId,
            action: "ai.action_plan.decision",
            entityType: "aiActionPlan",
            entityId: actionPlanId,
            before,
            after,
            requestId: input.requestId,
            timestamp: decidedAt,
            createdAt: decidedAt,
          },
          { session },
        );

        return after;
      });

      if (!result) throw new Error("La décision n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const duplicate = await this.decisionLogs.findOne({
          organizationId: context.organizationId,
          storeId,
          idempotencyKey: decisionInput.idempotencyKey,
        });
        if (
          duplicate?.entryType === "ai_action_plan" &&
          duplicate.actionPlanId?.equals(actionPlanId)
        ) {
          const plan = await this.actionPlans.findOne({
            _id: actionPlanId,
            organizationId: context.organizationId,
            storeId,
          });
          if (plan) return toActionPlan(plan);
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private toCreationResult(
    context: AuthorizedStoreContext,
    document: AiActionPlanDocument & { _id: ObjectId },
  ): CreateDraftActionPlanResult {
    const actionPlan = toActionPlan(document);
    assertAiActionPlanScope(context, actionPlan);
    return createDraftActionPlanResultSchema.parse({
      tool: "createDraftActionPlan",
      readOnly: false,
      storeIds: [context.storeId],
      evidence: actionPlan.evidence,
      semantics: actionPlan.semantics,
      limitations: actionPlan.limitations,
      data: actionPlan,
    });
  }
}
