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
  experimentSchema,
  type Experiment,
  type ExperimentCreateInput,
  type ExperimentFinishInput,
  type ExperimentStartInput,
  type ExperimentUpdateInput,
} from "@/domain/experiments/schemas";
import { resolveExperimentStatus } from "@/domain/experiments/lifecycle";
import { buildExperimentScope } from "@/domain/experiments/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface ExperimentDocument
  extends Omit<
    Experiment,
    | "id"
    | "storeId"
    | "departmentId"
    | "productIds"
    | "baselineConfig"
    | "linkedCommercialEventId"
    | "linkedRecommendationId"
    | "linkedDecisionIds"
    | "plannedStartAt"
    | "plannedEndAt"
    | "actualStartAt"
    | "actualEndAt"
    | "definitionFrozenAt"
    | "createdAt"
    | "updatedAt"
    | "plannedAt"
    | "startedAt"
    | "awaitingDataAt"
    | "analyzedAt"
    | "concludedAt"
    | "archivedAt"
    | "cancelledAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  productIds: ObjectId[];
  baselineConfig: Omit<Experiment["baselineConfig"], "controlStoreIds"> & {
    controlStoreIds: ObjectId[];
  };
  linkedCommercialEventId: ObjectId | null;
  linkedRecommendationId: ObjectId | null;
  linkedDecisionIds: ObjectId[];
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  definitionFrozenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  plannedAt: Date | null;
  startedAt: Date | null;
  awaitingDataAt: Date | null;
  analyzedAt: Date | null;
  concludedAt: Date | null;
  archivedAt: Date | null;
  cancelledAt: Date | null;
}

interface ExperimentCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  experimentId: ObjectId;
  commandType: string;
  snapshot: Experiment;
  createdAt: Date;
}

interface DepartmentDocument {
  organizationId: string;
  storeId: ObjectId;
  key: "fruit_vegetable";
  active: boolean;
}

interface LayoutDocument {
  organizationId: string;
  storeId: ObjectId;
  departmentKey: "fruit_vegetable";
  version: number;
  fixtures: Array<{ id: string }>;
  createdAt: Date;
}

interface CommercialEventLinkDocument {
  organizationId: string;
  storeId: ObjectId;
  fixtureId: string;
  productIds: ObjectId[];
}

interface RecommendationLinkDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: string;
}

export class ExperimentConflictError extends Error {
  readonly code = "EXPERIMENT_CONFLICT";

  constructor(message = "L'expérience a changé depuis son ouverture") {
    super(message);
    this.name = "ExperimentConflictError";
  }
}

export class InvalidExperimentReferenceError extends Error {
  readonly code = "INVALID_EXPERIMENT_REFERENCE";

  constructor(message: string) {
    super(message);
    this.name = "InvalidExperimentReferenceError";
  }
}

export class ExperimentNotFoundError extends Error {
  readonly code = "EXPERIMENT_NOT_FOUND";

  constructor() {
    super("Expérience introuvable ou accès refusé");
    this.name = "ExperimentNotFoundError";
  }
}

export class ExperimentTransitionError extends Error {
  readonly code = "EXPERIMENT_TRANSITION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "ExperimentTransitionError";
  }
}

function dateToIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toExperiment(document: WithId<ExperimentDocument>): Experiment {
  return experimentSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    productIds: document.productIds.map((id) => id.toHexString()),
    baselineConfig: {
      ...document.baselineConfig,
      controlStoreIds: document.baselineConfig.controlStoreIds.map((id) =>
        id.toHexString(),
      ),
    },
    linkedCommercialEventId:
      document.linkedCommercialEventId?.toHexString() ?? null,
    linkedRecommendationId:
      document.linkedRecommendationId?.toHexString() ?? null,
    linkedDecisionIds: document.linkedDecisionIds.map((id) => id.toHexString()),
    plannedStartAt: document.plannedStartAt.toISOString(),
    plannedEndAt: document.plannedEndAt.toISOString(),
    actualStartAt: dateToIso(document.actualStartAt),
    actualEndAt: dateToIso(document.actualEndAt),
    definitionFrozenAt: dateToIso(document.definitionFrozenAt),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    plannedAt: dateToIso(document.plannedAt),
    startedAt: dateToIso(document.startedAt),
    awaitingDataAt: dateToIso(document.awaitingDataAt),
    analyzedAt: dateToIso(document.analyzedAt),
    concludedAt: dateToIso(document.concludedAt),
    archivedAt: dateToIso(document.archivedAt),
    cancelledAt: dateToIso(document.cancelledAt),
  });
}

export class ExperimentRepository {
  private readonly experiments;
  private readonly commands;
  private readonly departments;
  private readonly products;
  private readonly layouts;
  private readonly commercialEvents;
  private readonly recommendations;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.experiments = db.collection<ExperimentDocument>("experiments");
    this.commands =
      db.collection<ExperimentCommandDocument>("experimentCommands");
    this.departments = db.collection<DepartmentDocument>("departments");
    this.products = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      active: boolean;
    }>("products");
    this.layouts = db.collection<LayoutDocument>("layoutVersions");
    this.commercialEvents =
      db.collection<CommercialEventLinkDocument>("commercialEvents");
    this.recommendations =
      db.collection<RecommendationLinkDocument>("recommendations");
    this.auditLogs = db.collection("auditLogs");
  }

  async listForStore(
    context: AuthorizedStoreContext,
  ): Promise<Experiment[]> {
    const scope = buildExperimentScope(context);
    const documents = await this.experiments
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
      })
      .sort({ plannedStartAt: -1, createdAt: -1 })
      .limit(500)
      .toArray();

    return documents.map(toExperiment);
  }

  async findForStore(
    context: AuthorizedStoreContext,
    experimentId: string,
  ): Promise<Experiment | null> {
    const scope = buildExperimentScope(context);
    const document = await this.experiments.findOne({
      _id: new ObjectId(experimentId),
      organizationId: scope.organizationId,
      storeId: new ObjectId(scope.storeId),
    });

    return document ? toExperiment(document) : null;
  }

  async create(input: {
    context: AuthorizedStoreContext;
    createInput: ExperimentCreateInput;
    requestId: string;
  }): Promise<Experiment> {
    const { context, createInput, requestId } = input;
    const duplicate = await this.getCommandSnapshot({
      context,
      idempotencyKey: createInput.idempotencyKey,
      commandType: "create",
    });
    if (duplicate) {
      return duplicate;
    }
    this.requireClient();

    const session = this.client!.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const departmentId = await this.validateDefinitionReferences({
          context,
          definition: createInput,
          session,
        });
        const now = new Date();
        const experimentId = new ObjectId();
        const experiment = experimentSchema.parse({
          ...createInput,
          id: experimentId.toHexString(),
          organizationId: context.organizationId,
          storeId: context.storeId,
          departmentId: departmentId.toHexString(),
          status: "draft",
          ownerUserId: context.userId,
          treatmentActual: null,
          actualStartAt: null,
          actualEndAt: null,
          linkedDecisionIds: [],
          definitionFrozenAt: null,
          definitionFrozenBy: null,
          completionNotes: null,
          createdBy: context.userId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          plannedAt: null,
          startedAt: null,
          awaitingDataAt: null,
          analyzedAt: null,
          concludedAt: null,
          archivedAt: null,
          cancelledAt: null,
        });

        await this.experiments.insertOne(
          this.toDocument(experimentId, experiment),
          { session },
        );
        await this.recordMutation({
          context,
          idempotencyKey: createInput.idempotencyKey,
          commandType: "create",
          experimentId,
          before: null,
          after: experiment,
          action: "experiment.created",
          requestId,
          now,
          session,
        });
        return experiment;
      });

      if (!result) throw new Error("L'expérience n'a pas été créée");
      return result;
    } catch (error) {
      return this.handleDuplicateCommand(
        error,
        context,
        createInput.idempotencyKey,
        "create",
      );
    } finally {
      await session.endSession();
    }
  }

  async updateDefinition(input: {
    context: AuthorizedStoreContext;
    experimentId: string;
    updateInput: ExperimentUpdateInput;
    requestId: string;
  }): Promise<Experiment> {
    const { context, experimentId, updateInput, requestId } = input;
    const commandType = `update:${updateInput.action}`;
    const expectedExperimentId = new ObjectId(experimentId);
    const duplicate = await this.getCommandSnapshot({
      context,
      idempotencyKey: updateInput.idempotencyKey,
      commandType,
      expectedExperimentId,
    });
    if (duplicate) return duplicate;
    this.requireClient();

    const session = this.client!.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const { document, experiment: current } = await this.requireCurrent({
          context,
          experimentId,
          basedOnUpdatedAt: updateInput.basedOnUpdatedAt,
          session,
        });
        const status = resolveExperimentStatus({
          currentStatus: current.status,
          action: updateInput.action,
        });
        if (!status) {
          throw new ExperimentTransitionError(
            "La définition est gelée ou cette transition n'est plus permise",
          );
        }
        if (
          updateInput.action === "cancel" &&
          (current.status === "running" || current.status === "awaiting_data") &&
          !context.permissions.includes("experiments.start")
        ) {
          throw new StoreAccessDeniedError();
        }

        const editsDefinition = updateInput.action !== "cancel";
        const departmentId = editsDefinition
          ? await this.validateDefinitionReferences({
              context,
              definition: updateInput,
              session,
            })
          : new ObjectId(current.departmentId);
        const now = new Date();
        const experiment = experimentSchema.parse({
          ...current,
          ...(editsDefinition
            ? {
                title: updateInput.title,
                hypothesis: updateInput.hypothesis,
                type: updateInput.type,
                productIds: updateInput.productIds,
                family: updateInput.family,
                treatmentPlan: updateInput.treatmentPlan,
                plannedStartAt: updateInput.plannedStartAt,
                plannedEndAt: updateInput.plannedEndAt,
                primaryMetric: updateInput.primaryMetric,
                secondaryMetrics: updateInput.secondaryMetrics,
                guardrailMetrics: updateInput.guardrailMetrics,
                baselineConfig: updateInput.baselineConfig,
                expectedRelativeEffect: updateInput.expectedRelativeEffect,
                explicitCostsCents: updateInput.explicitCostsCents,
                confounders: updateInput.confounders,
                linkedCommercialEventId: updateInput.linkedCommercialEventId,
                linkedRecommendationId: updateInput.linkedRecommendationId,
              }
            : {}),
          departmentId: departmentId.toHexString(),
          status,
          updatedAt: now.toISOString(),
          plannedAt:
            status === "planned"
              ? (current.plannedAt ?? now.toISOString())
              : current.plannedAt,
          cancelledAt:
            status === "cancelled" ? now.toISOString() : current.cancelledAt,
        });
        await this.replaceCurrent(document, experiment, session);
        await this.recordMutation({
          context,
          idempotencyKey: updateInput.idempotencyKey,
          commandType,
          experimentId: document._id,
          before: current,
          after: experiment,
          action:
            status === "cancelled"
              ? "experiment.cancelled"
              : status === "planned" && current.status === "draft"
                ? "experiment.planned"
                : "experiment.updated",
          requestId,
          now,
          session,
        });
        return experiment;
      });

      if (!result) throw new Error("L'expérience n'a pas été modifiée");
      return result;
    } catch (error) {
      return this.handleDuplicateCommand(
        error,
        context,
        updateInput.idempotencyKey,
        commandType,
        expectedExperimentId,
      );
    } finally {
      await session.endSession();
    }
  }

  async start(input: {
    context: AuthorizedStoreContext;
    experimentId: string;
    startInput: ExperimentStartInput;
    requestId: string;
  }): Promise<Experiment> {
    const { context, experimentId, startInput, requestId } = input;
    const commandType = "start";
    const expectedExperimentId = new ObjectId(experimentId);
    const duplicate = await this.getCommandSnapshot({
      context,
      idempotencyKey: startInput.idempotencyKey,
      commandType,
      expectedExperimentId,
    });
    if (duplicate) return duplicate;
    this.requireClient();

    const session = this.client!.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const { document, experiment: current } = await this.requireCurrent({
          context,
          experimentId,
          basedOnUpdatedAt: startInput.basedOnUpdatedAt,
          session,
        });
        const status = resolveExperimentStatus({
          currentStatus: current.status,
          action: "start",
        });
        if (!status) {
          throw new ExperimentTransitionError(
            "Seule une expérience planifiée peut démarrer",
          );
        }
        if (
          current.type === "tg_placement" &&
          startInput.treatmentActual.fixtureId === null
        ) {
          throw new InvalidExperimentReferenceError(
            "Le traitement réel d'une expérience TG doit identifier la TG",
          );
        }

        await this.validateActualFixture({
          context,
          fixtureId: startInput.treatmentActual.fixtureId,
          session,
        });
        const now = new Date();
        const actualStartAt = startInput.actualStartAt
          ? new Date(startInput.actualStartAt)
          : now;
        const experiment = experimentSchema.parse({
          ...current,
          status,
          treatmentActual: startInput.treatmentActual,
          actualStartAt: actualStartAt.toISOString(),
          definitionFrozenAt: now.toISOString(),
          definitionFrozenBy: context.userId,
          updatedAt: now.toISOString(),
          startedAt: now.toISOString(),
        });
        await this.replaceCurrent(document, experiment, session);
        await this.recordMutation({
          context,
          idempotencyKey: startInput.idempotencyKey,
          commandType,
          experimentId: document._id,
          before: current,
          after: experiment,
          action: "experiment.started",
          requestId,
          now,
          session,
        });
        return experiment;
      });

      if (!result) throw new Error("L'expérience n'a pas démarré");
      return result;
    } catch (error) {
      return this.handleDuplicateCommand(
        error,
        context,
        startInput.idempotencyKey,
        commandType,
        expectedExperimentId,
      );
    } finally {
      await session.endSession();
    }
  }

  async finish(input: {
    context: AuthorizedStoreContext;
    experimentId: string;
    finishInput: ExperimentFinishInput;
    requestId: string;
  }): Promise<Experiment> {
    const { context, experimentId, finishInput, requestId } = input;
    const commandType = "finish";
    const expectedExperimentId = new ObjectId(experimentId);
    const duplicate = await this.getCommandSnapshot({
      context,
      idempotencyKey: finishInput.idempotencyKey,
      commandType,
      expectedExperimentId,
    });
    if (duplicate) return duplicate;
    this.requireClient();

    const session = this.client!.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const { document, experiment: current } = await this.requireCurrent({
          context,
          experimentId,
          basedOnUpdatedAt: finishInput.basedOnUpdatedAt,
          session,
        });
        const status = resolveExperimentStatus({
          currentStatus: current.status,
          action: "finish",
        });
        if (!status) {
          throw new ExperimentTransitionError(
            "Seule une expérience en cours peut être terminée",
          );
        }

        const now = new Date();
        const actualEndAt = finishInput.actualEndAt
          ? new Date(finishInput.actualEndAt)
          : now;
        if (
          !current.actualStartAt ||
          actualEndAt.getTime() <= new Date(current.actualStartAt).getTime()
        ) {
          throw new ExperimentTransitionError(
            "La fin réelle doit suivre le début réel",
          );
        }
        const confounders = Array.from(
          new Set([...current.confounders, ...finishInput.additionalConfounders]),
        );
        const experiment = experimentSchema.parse({
          ...current,
          status,
          actualEndAt: actualEndAt.toISOString(),
          confounders,
          completionNotes: finishInput.completionNotes,
          updatedAt: now.toISOString(),
          awaitingDataAt: now.toISOString(),
        });
        await this.replaceCurrent(document, experiment, session);
        await this.recordMutation({
          context,
          idempotencyKey: finishInput.idempotencyKey,
          commandType,
          experimentId: document._id,
          before: current,
          after: experiment,
          action: "experiment.awaiting_data",
          requestId,
          now,
          session,
        });
        return experiment;
      });

      if (!result) throw new Error("L'expérience n'a pas été terminée");
      return result;
    } catch (error) {
      return this.handleDuplicateCommand(
        error,
        context,
        finishInput.idempotencyKey,
        commandType,
        expectedExperimentId,
      );
    } finally {
      await session.endSession();
    }
  }

  private requireClient(): void {
    if (!this.client) {
      throw new Error("Client Mongo requis pour modifier une expérience");
    }
  }

  private async requireCurrent(input: {
    context: AuthorizedStoreContext;
    experimentId: string;
    basedOnUpdatedAt: string;
    session: ClientSession;
  }) {
    const scope = buildExperimentScope(input.context);
    const document = await this.experiments.findOne(
      {
        _id: new ObjectId(input.experimentId),
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
      },
      { session: input.session },
    );
    if (!document) {
      throw new ExperimentNotFoundError();
    }

    const experiment = toExperiment(document);
    if (experiment.updatedAt !== input.basedOnUpdatedAt) {
      throw new ExperimentConflictError();
    }
    return { document, experiment };
  }

  private async validateDefinitionReferences(input: {
    context: AuthorizedStoreContext;
    definition: ExperimentCreateInput | ExperimentUpdateInput;
    session: ClientSession;
  }): Promise<ObjectId> {
    const storeId = new ObjectId(input.context.storeId);
    const scope = {
      organizationId: input.context.organizationId,
      storeId,
    };
    const department = await this.departments.findOne(
      { ...scope, key: "fruit_vegetable", active: true },
      { session: input.session },
    );
    if (!department) {
      throw new InvalidExperimentReferenceError(
        "Le rayon Fruits et Légumes est introuvable",
      );
    }

    const productIds = input.definition.productIds.map((id) => new ObjectId(id));
    const productCount = await this.products.countDocuments(
      {
        _id: { $in: productIds },
        ...scope,
        active: true,
      },
      { session: input.session },
    );
    if (productCount !== input.definition.productIds.length) {
      throw new InvalidExperimentReferenceError(
        "Un produit n'appartient pas à ce magasin",
      );
    }

    if (input.definition.baselineConfig.controlStoreIds.includes(input.context.storeId)) {
      throw new InvalidExperimentReferenceError(
        "Le magasin testé ne peut pas être son propre contrôle",
      );
    }

    await this.validateActualFixture({
      context: input.context,
      fixtureId: input.definition.treatmentPlan.fixtureId,
      session: input.session,
    });
    await this.validateCommercialEventLink({
      id: input.definition.linkedCommercialEventId,
      definition: input.definition,
      context: input.context,
      session: input.session,
    });
    await this.validateRecommendationLink({
      id: input.definition.linkedRecommendationId,
      productIds: input.definition.productIds,
      context: input.context,
      session: input.session,
    });

    return department._id;
  }

  private async validateActualFixture(input: {
    context: AuthorizedStoreContext;
    fixtureId: string | null;
    session: ClientSession;
  }): Promise<void> {
    if (input.fixtureId === null) return;
    const layout = await this.layouts.findOne(
      {
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        departmentKey: "fruit_vegetable",
      },
      { sort: { version: -1, createdAt: -1 }, session: input.session },
    );
    if (!layout?.fixtures.some((fixture) => fixture.id === input.fixtureId)) {
      throw new InvalidExperimentReferenceError(
        "Le mobilier sélectionné n'appartient pas au plan courant",
      );
    }
  }

  private async validateCommercialEventLink(input: {
    id: string | null;
    definition: ExperimentCreateInput | ExperimentUpdateInput;
    context: AuthorizedStoreContext;
    session: ClientSession;
  }): Promise<void> {
    if (input.id === null) return;
    const linked = await this.commercialEvents.findOne(
      {
        _id: new ObjectId(input.id),
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
      },
      { projection: { fixtureId: 1, productIds: 1 }, session: input.session },
    );
    if (!linked) {
      throw new InvalidExperimentReferenceError(
        "L'opération commerciale n'appartient pas à ce magasin",
      );
    }

    if (
      input.definition.type === "tg_placement" &&
      linked.fixtureId !== input.definition.treatmentPlan.fixtureId
    ) {
      throw new InvalidExperimentReferenceError(
        "L'opération commerciale ne concerne pas la TG testée",
      );
    }
    const linkedProductIds = new Set(
      linked.productIds.map((productId) => productId.toHexString()),
    );
    if (
      input.definition.productIds.some(
        (productId) => !linkedProductIds.has(productId),
      )
    ) {
      throw new InvalidExperimentReferenceError(
        "Un produit testé n'appartient pas à l'opération commerciale liée",
      );
    }
  }

  private async validateRecommendationLink(input: {
    id: string | null;
    productIds: string[];
    context: AuthorizedStoreContext;
    session: ClientSession;
  }): Promise<void> {
    if (input.id === null) return;
    const linked = await this.recommendations.findOne(
      {
        _id: new ObjectId(input.id),
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
      },
      { projection: { productId: 1 }, session: input.session },
    );
    if (!linked) {
      throw new InvalidExperimentReferenceError(
        "La recommandation n'appartient pas à ce magasin",
      );
    }
    if (!input.productIds.includes(linked.productId)) {
      throw new InvalidExperimentReferenceError(
        "La recommandation ne concerne aucun produit testé",
      );
    }
  }

  private async replaceCurrent(
    current: WithId<ExperimentDocument>,
    experiment: Experiment,
    session: ClientSession,
  ): Promise<void> {
    const result = await this.experiments.replaceOne(
      { _id: current._id, updatedAt: current.updatedAt },
      this.toDocument(current._id, experiment),
      { session },
    );
    if (result.modifiedCount !== 1) throw new ExperimentConflictError();
  }

  private toDocument(
    experimentId: ObjectId,
    experiment: Experiment,
  ): WithId<ExperimentDocument> {
    return {
      _id: experimentId,
      organizationId: experiment.organizationId,
      storeId: new ObjectId(experiment.storeId),
      departmentId: new ObjectId(experiment.departmentId),
      title: experiment.title,
      hypothesis: experiment.hypothesis,
      type: experiment.type,
      status: experiment.status,
      ownerUserId: experiment.ownerUserId,
      productIds: experiment.productIds.map((id) => new ObjectId(id)),
      family: experiment.family,
      treatmentPlan: experiment.treatmentPlan,
      treatmentActual: experiment.treatmentActual,
      plannedStartAt: new Date(experiment.plannedStartAt),
      plannedEndAt: new Date(experiment.plannedEndAt),
      actualStartAt: experiment.actualStartAt
        ? new Date(experiment.actualStartAt)
        : null,
      actualEndAt: experiment.actualEndAt ? new Date(experiment.actualEndAt) : null,
      primaryMetric: experiment.primaryMetric,
      secondaryMetrics: experiment.secondaryMetrics,
      guardrailMetrics: experiment.guardrailMetrics,
      baselineConfig: {
        ...experiment.baselineConfig,
        controlStoreIds: experiment.baselineConfig.controlStoreIds.map(
          (id) => new ObjectId(id),
        ),
      },
      expectedRelativeEffect: experiment.expectedRelativeEffect,
      explicitCostsCents: experiment.explicitCostsCents,
      confounders: experiment.confounders,
      linkedCommercialEventId: experiment.linkedCommercialEventId
        ? new ObjectId(experiment.linkedCommercialEventId)
        : null,
      linkedRecommendationId: experiment.linkedRecommendationId
        ? new ObjectId(experiment.linkedRecommendationId)
        : null,
      linkedDecisionIds: experiment.linkedDecisionIds.map((id) =>
        new ObjectId(id),
      ),
      definitionFrozenAt: experiment.definitionFrozenAt
        ? new Date(experiment.definitionFrozenAt)
        : null,
      definitionFrozenBy: experiment.definitionFrozenBy,
      completionNotes: experiment.completionNotes,
      createdBy: experiment.createdBy,
      createdAt: new Date(experiment.createdAt),
      updatedAt: new Date(experiment.updatedAt),
      plannedAt: experiment.plannedAt ? new Date(experiment.plannedAt) : null,
      startedAt: experiment.startedAt ? new Date(experiment.startedAt) : null,
      awaitingDataAt: experiment.awaitingDataAt
        ? new Date(experiment.awaitingDataAt)
        : null,
      analyzedAt: experiment.analyzedAt ? new Date(experiment.analyzedAt) : null,
      concludedAt: experiment.concludedAt
        ? new Date(experiment.concludedAt)
        : null,
      archivedAt: experiment.archivedAt ? new Date(experiment.archivedAt) : null,
      cancelledAt: experiment.cancelledAt
        ? new Date(experiment.cancelledAt)
        : null,
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

  private async recordMutation(input: {
    context: AuthorizedStoreContext;
    idempotencyKey: string;
    commandType: string;
    experimentId: ObjectId;
    before: Experiment | null;
    after: Experiment;
    action: string;
    requestId: string;
    now: Date;
    session: ClientSession;
  }): Promise<void> {
    await this.commands.insertOne(
      {
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        idempotencyKey: input.idempotencyKey,
        experimentId: input.experimentId,
        commandType: input.commandType,
        snapshot: input.after,
        createdAt: input.now,
      },
      { session: input.session },
    );
    await this.auditLogs.insertOne(
      {
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        actorId: input.context.userId,
        action: input.action,
        entityType: "experiment",
        entityId: input.experimentId,
        before: input.before,
        after: input.after,
        requestId: input.requestId,
        timestamp: input.now,
        createdAt: input.now,
      },
      { session: input.session },
    );
  }

  private async handleDuplicateCommand(
    error: unknown,
    context: AuthorizedStoreContext,
    idempotencyKey: string,
    commandType: string,
    expectedExperimentId?: ObjectId,
  ): Promise<Experiment> {
    if (error instanceof MongoServerError && error.code === 11000) {
      const duplicate = await this.getCommandSnapshot({
        context,
        idempotencyKey,
        commandType,
        expectedExperimentId,
      });
      if (duplicate) return duplicate;
    }
    throw error;
  }

  private async getCommandSnapshot(input: {
    context: AuthorizedStoreContext;
    idempotencyKey: string;
    commandType: string;
    expectedExperimentId?: ObjectId;
  }): Promise<Experiment | null> {
    const command = await this.findCommand(
      input.context,
      input.idempotencyKey,
    );
    if (!command) return null;

    const wrongExperiment =
      input.expectedExperimentId !== undefined &&
      !command.experimentId.equals(input.expectedExperimentId);
    if (wrongExperiment || command.commandType !== input.commandType) {
      throw new ExperimentConflictError(
        "Cette clé d'idempotence a déjà servi pour une autre commande",
      );
    }

    return experimentSchema.parse(command.snapshot);
  }
}
