import "server-only";

import {
  type Db,
  type MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  defaultEditableStoreSettings,
  periodTargetSchema,
  storeSettingsSnapshotSchema,
  type EditableStoreSettings,
  type PeriodTarget,
  type PeriodTargetUpsertInput,
  type StoreSettingsSnapshot,
  type StoreSettingsUpdateInput,
} from "@/domain/configuration/schemas";
import { buildStoreConfigurationScope } from "@/domain/configuration/store-scope";
import { configVersion } from "@/domain/configuration/versions";
import { defaultAnalyticsConfig } from "@/domain/analytics/schemas";
import { defaultBaselineEngineConfig } from "@/domain/experiments/baseline";
import { defaultEvaluationEngineConfig } from "@/domain/experiments/evaluation-schemas";
import { defaultRecommendationConfig } from "@/domain/recommendations/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface StoreSettingsDocument extends EditableStoreSettings {
  organizationId: string;
  storeId: ObjectId;
  revision: number;
  updatedAt: Date;
  updatedBy: string;
}

interface PeriodTargetDocument {
  organizationId: string;
  storeId: ObjectId;
  periodKey: string;
  targetRevenueCents: number;
  updatedAt: Date;
  updatedBy: string;
}

interface StoreConfigurationCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  action: "settings.update" | "target.upsert";
  snapshot: unknown;
  createdAt: Date;
}

export class StoreConfigurationConflictError extends Error {
  readonly code = "STORE_CONFIGURATION_CONFLICT";

  constructor(message = "La configuration a été modifiée depuis l’ouverture de la page") {
    super(message);
    this.name = "StoreConfigurationConflictError";
  }
}

function toSettingsSnapshot(
  document: StoreSettingsDocument | null,
): StoreSettingsSnapshot {
  const revision = document?.revision ?? 0;
  const values = document ?? defaultEditableStoreSettings;

  return storeSettingsSnapshotSchema.parse({
    revision,
    updatedAt: document?.updatedAt?.toISOString() ?? null,
    analytics: {
      ...defaultAnalyticsConfig,
      ...values.analytics,
      calculationVersion: configVersion(
        defaultAnalyticsConfig.calculationVersion,
        revision,
      ),
    },
    recommendations: {
      ...defaultRecommendationConfig,
      ...values.recommendations,
      modelVersion: configVersion(
        defaultRecommendationConfig.modelVersion,
        revision,
      ),
    },
    experiments: {
      baseline: {
        ...defaultBaselineEngineConfig,
        ...values.experiments.baseline,
        engineVersion: configVersion(
          defaultBaselineEngineConfig.engineVersion,
          revision,
        ),
      },
      evaluation: {
        ...defaultEvaluationEngineConfig,
        ...values.experiments.evaluation,
        engineVersion: configVersion(
          defaultEvaluationEngineConfig.engineVersion,
          revision,
        ),
      },
    },
    space: {
      allocation: {
        ...defaultEditableStoreSettings.space.allocation,
        ...values.space.allocation,
      },
    },
  });
}

function toPeriodTarget(
  document: WithId<PeriodTargetDocument>,
): PeriodTarget {
  return periodTargetSchema.parse({
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    periodKey: document.periodKey,
    targetRevenueCents: document.targetRevenueCents,
    updatedAt: document.updatedAt.toISOString(),
  });
}

function sameTimestamp(date: Date | undefined, expected: string | null) {
  return (date?.toISOString() ?? null) === expected;
}

export class StoreConfigurationRepository {
  private readonly settings;
  private readonly targets;
  private readonly commands;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.settings = db.collection<StoreSettingsDocument>("storeSettings");
    this.targets = db.collection<PeriodTargetDocument>("periodTargets");
    this.commands =
      db.collection<StoreConfigurationCommandDocument>(
        "storeConfigurationCommands",
      );
    this.auditLogs = db.collection("auditLogs");
  }

  async getSettings(
    context: AuthorizedStoreContext,
  ): Promise<StoreSettingsSnapshot> {
    const scope = buildStoreConfigurationScope(context);
    const document = await this.settings.findOne({
      organizationId: scope.organizationId,
      storeId: new ObjectId(scope.storeId),
    });

    return toSettingsSnapshot(document);
  }

  async listTargets(
    context: AuthorizedStoreContext,
  ): Promise<PeriodTarget[]> {
    const scope = buildStoreConfigurationScope(context);
    const documents = await this.targets
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
      })
      .sort({ periodKey: -1 })
      .limit(60)
      .toArray();

    return documents.map(toPeriodTarget);
  }

  async getTargetRevenueCents(
    context: AuthorizedStoreContext,
    periodKey: string,
  ): Promise<number | null> {
    const scope = buildStoreConfigurationScope(context);
    const document = await this.targets.findOne(
      {
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        periodKey,
      },
      { projection: { targetRevenueCents: 1 } },
    );

    return document?.targetRevenueCents ?? null;
  }

  async updateSettings(input: {
    context: AuthorizedStoreContext;
    updateInput: StoreSettingsUpdateInput;
    requestId: string;
  }): Promise<StoreSettingsSnapshot> {
    const { context, updateInput, requestId } = input;
    const scope = buildStoreConfigurationScope(context);
    const storeId = new ObjectId(scope.storeId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: updateInput.idempotencyKey,
      action: "settings.update" as const,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate) return storeSettingsSnapshotSchema.parse(duplicate.snapshot);
    if (!this.client) throw new Error("Client Mongo requis pour modifier les réglages");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, { session });
        if (repeated) {
          return storeSettingsSnapshotSchema.parse(repeated.snapshot);
        }

        const current = await this.settings.findOne(
          { organizationId: scope.organizationId, storeId },
          { session },
        );
        if (!sameTimestamp(current?.updatedAt, updateInput.basedOnUpdatedAt)) {
          throw new StoreConfigurationConflictError();
        }

        const before = toSettingsSnapshot(current);
        const now = new Date();
        const revision = (current?.revision ?? 0) + 1;
        const document: StoreSettingsDocument = {
          organizationId: scope.organizationId,
          storeId,
          revision,
          ...updateInput.settings,
          updatedAt: now,
          updatedBy: context.userId,
        };
        await this.settings.replaceOne(
          { organizationId: scope.organizationId, storeId },
          document,
          { upsert: true, session },
        );
        const after = toSettingsSnapshot(document);
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "store.settings.updated",
            entityType: "storeSettings",
            entityId: storeId,
            before,
            after,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.commands.insertOne(
          {
            ...commandFilter,
            snapshot: after,
            createdAt: now,
          },
          { session },
        );
        return after;
      });

      if (!result) throw new Error("Les réglages n’ont pas été enregistrés");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated) {
          return storeSettingsSnapshotSchema.parse(repeated.snapshot);
        }
        throw new StoreConfigurationConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async upsertTarget(input: {
    context: AuthorizedStoreContext;
    targetInput: PeriodTargetUpsertInput;
    requestId: string;
  }): Promise<PeriodTarget> {
    const { context, targetInput, requestId } = input;
    const scope = buildStoreConfigurationScope(context);
    const storeId = new ObjectId(scope.storeId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: targetInput.idempotencyKey,
      action: "target.upsert" as const,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate) return periodTargetSchema.parse(duplicate.snapshot);
    if (!this.client) throw new Error("Client Mongo requis pour modifier l’objectif");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, { session });
        if (repeated) return periodTargetSchema.parse(repeated.snapshot);

        const targetFilter = {
          organizationId: scope.organizationId,
          storeId,
          periodKey: targetInput.periodKey,
        };
        const current = await this.targets.findOne(targetFilter, { session });
        if (!sameTimestamp(current?.updatedAt, targetInput.basedOnUpdatedAt)) {
          throw new StoreConfigurationConflictError(
            "Cet objectif a été modifié depuis l’ouverture de la page",
          );
        }

        const now = new Date();
        const updated = await this.targets.findOneAndUpdate(
          targetFilter,
          {
            $set: {
              targetRevenueCents: targetInput.targetRevenueCents,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $setOnInsert: {
              organizationId: scope.organizationId,
              storeId,
              periodKey: targetInput.periodKey,
            },
          },
          { upsert: true, returnDocument: "after", session },
        );
        if (!updated) throw new Error("L’objectif n’a pas été enregistré");
        const before = current ? toPeriodTarget(current) : null;
        const after = toPeriodTarget(updated);
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "store.target.upserted",
            entityType: "periodTarget",
            entityId: updated._id,
            before,
            after,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.commands.insertOne(
          {
            ...commandFilter,
            snapshot: after,
            createdAt: now,
          },
          { session },
        );
        return after;
      });

      if (!result) throw new Error("L’objectif n’a pas été enregistré");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated) return periodTargetSchema.parse(repeated.snapshot);
        throw new StoreConfigurationConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
