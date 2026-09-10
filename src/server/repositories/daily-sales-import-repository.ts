import "server-only";

import { Db, MongoClient, ObjectId } from "mongodb";

import { groupDailyImportFacts } from "@/domain/imports/daily-import-commit";
import { planDailyFactVersions } from "@/domain/imports/daily-fact-versioning";
import {
  dailyImportCommitResultSchema,
  type DailyImportCommitResult,
  type DailyMercalysPreview,
  type UnresolvedDailyAlias,
} from "@/domain/imports/daily-schemas";
import {
  validateAliasResolutions,
} from "@/domain/imports/import-commit";
import { normalizeExternalKey } from "@/domain/imports/normalization";
import type { AliasResolution } from "@/domain/imports/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  findUnresolvedMercalysIdentities,
  loadMercalysAliasTargets,
  persistMercalysIdentityAliases,
  resolveMercalysProductIds,
  type ProductAliasDocument,
} from "@/server/repositories/mercalys-alias-resolution";

interface DailySalesImportJobDocument {
  organizationId: string;
  storeId: ObjectId;
  departmentId: ObjectId;
  datasetKind: "daily_sales";
  source: "mercalys_daily";
  fingerprint: string;
  coverageKey: string;
  status: "preview" | "committed";
  sourceFile: { name: string; size: number };
  preview: DailyMercalysPreview;
  unresolvedAliases: UnresolvedDailyAlias[];
  createdBy: string;
  createdAt: Date;
  committedAt?: Date;
  committedBy?: string;
  committedResult?: DailyImportCommitResult;
}

interface ProductDocument {
  organizationId: string;
  storeId: ObjectId;
  label: string;
  normalizedLabel: string;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DailySalesFactDocument {
  organizationId: string;
  storeId: ObjectId;
  departmentId: ObjectId;
  productId: ObjectId;
  businessDate: string;
  periodKey: string;
  isoWeekKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
  purchaseCents: number | null;
  rceCents: number | null;
  vatCents: number | null;
  source: "mercalys_daily";
  importJobId: ObjectId;
  version: number;
  active: boolean;
  supersedesFactId: ObjectId | null;
  supersededByImportJobId?: ObjectId;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface StoreDocument {
  organizationId: string;
  code: string;
  active: boolean;
  dataRevision: number;
}

export interface DailyImportPreviewRecord {
  importId: string;
  fingerprint: string;
  preview: DailyMercalysPreview;
  unresolvedAliases: UnresolvedDailyAlias[];
}

export class DailyStoreCodeMismatchError extends Error {
  constructor(sourceCode: string, targetCode: string) {
    super(
      `Le fichier appartient au PDV ${sourceCode}, différent du magasin ${targetCode}`,
    );
    this.name = "DailyStoreCodeMismatchError";
  }
}

export class DailySalesImportRepository {
  private readonly importJobs;
  private readonly facts;
  private readonly productAliases;
  private readonly products;
  private readonly stores;
  private readonly departments;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client: MongoClient,
  ) {
    this.importJobs = db.collection<DailySalesImportJobDocument>(
      "dailySalesImportJobs",
    );
    this.facts = db.collection<DailySalesFactDocument>("dailySalesFacts");
    this.productAliases = db.collection<ProductAliasDocument>("productAliases");
    this.products = db.collection<ProductDocument>("products");
    this.stores = db.collection<StoreDocument>("stores");
    this.departments = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      key: string;
      active: boolean;
    }>("departments");
    this.auditLogs = db.collection("auditLogs");
  }

  async findUnresolvedAliases(
    context: AuthorizedStoreContext,
    preview: DailyMercalysPreview,
  ): Promise<UnresolvedDailyAlias[]> {
    const rows = preview.rows.filter((row) => !row.excluded);
    const targets = await loadMercalysAliasTargets({
      collection: this.productAliases,
      context,
      rows,
    });
    return findUnresolvedMercalysIdentities({ rows, targets });
  }

  private async requireMatchingStore(
    context: AuthorizedStoreContext,
    sourceStoreCode: string | null,
  ): Promise<StoreDocument & { _id: ObjectId }> {
    const store = await this.stores.findOne({
      _id: new ObjectId(context.storeId),
      organizationId: context.organizationId,
      active: true,
    });
    if (!store) {
      throw new Error("Magasin introuvable ou accès refusé");
    }
    if (
      sourceStoreCode &&
      normalizeExternalKey(sourceStoreCode) !== normalizeExternalKey(store.code)
    ) {
      throw new DailyStoreCodeMismatchError(sourceStoreCode, store.code);
    }
    return store;
  }

  async savePreview(input: {
    context: AuthorizedStoreContext;
    fingerprint: string;
    fileName: string;
    fileSize: number;
    preview: DailyMercalysPreview;
    unresolvedAliases: UnresolvedDailyAlias[];
  }): Promise<DailyImportPreviewRecord> {
    const { context, fingerprint, fileName, fileSize, preview, unresolvedAliases } =
      input;
    await this.requireMatchingStore(context, preview.sourceStoreCode);
    const department = await this.departments.findOne({
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      key: "fruit_vegetable",
      active: true,
    });
    if (!department) {
      throw new Error("Rayon fruits et légumes introuvable");
    }

    const filter = {
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      fingerprint,
      coverageKey: preview.coverageKey,
    };
    await this.importJobs.updateOne(
      filter,
      {
        $setOnInsert: {
          ...filter,
          departmentId: department._id,
          datasetKind: "daily_sales",
          source: "mercalys_daily",
          status: "preview",
          sourceFile: { name: fileName, size: fileSize },
          preview,
          unresolvedAliases,
          createdBy: context.userId,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    const document = await this.importJobs.findOne(filter);
    if (!document) {
      throw new Error("La prévisualisation journalière n’a pas pu être enregistrée");
    }

    return {
      importId: document._id.toHexString(),
      fingerprint: document.fingerprint,
      preview: document.preview,
      unresolvedAliases: document.unresolvedAliases,
    };
  }

  async commit(input: {
    context: AuthorizedStoreContext;
    importId: string;
    resolutions: AliasResolution[];
    requestId: string;
  }): Promise<DailyImportCommitResult> {
    const { context, importId, resolutions, requestId } = input;
    const importObjectId = new ObjectId(importId);
    const storeObjectId = new ObjectId(context.storeId);
    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const job = await this.importJobs.findOne(
          {
            _id: importObjectId,
            organizationId: context.organizationId,
            storeId: storeObjectId,
          },
          { session },
        );
        if (!job) {
          throw new Error("Import journalier introuvable ou accès refusé");
        }
        if (job.status === "committed" && job.committedResult) {
          return job.committedResult;
        }

        const store = await this.stores.findOne(
          {
            _id: storeObjectId,
            organizationId: context.organizationId,
            active: true,
          },
          { session },
        );
        if (!store) {
          throw new Error("Magasin introuvable ou accès refusé");
        }
        if (
          job.preview.sourceStoreCode &&
          normalizeExternalKey(job.preview.sourceStoreCode) !==
            normalizeExternalKey(store.code)
        ) {
          throw new DailyStoreCodeMismatchError(
            job.preview.sourceStoreCode,
            store.code,
          );
        }

        const resolutionMap = validateAliasResolutions(
          job.unresolvedAliases.map((alias) => alias.externalKey),
          resolutions,
        );
        const includedRows = job.preview.rows.filter((row) => !row.excluded);
        const aliasTargets = await loadMercalysAliasTargets({
          collection: this.productAliases,
          context,
          rows: includedRows,
          session,
        });
        const productIdsByExternalKey = resolveMercalysProductIds({
          rows: includedRows,
          targets: aliasTargets,
        });
        const now = new Date();

        for (const unresolvedAlias of job.unresolvedAliases) {
          if (productIdsByExternalKey.has(unresolvedAlias.externalKey)) {
            continue;
          }
          const resolution = resolutionMap.get(unresolvedAlias.externalKey);
          if (!resolution) {
            throw new Error(`Alias non résolu: ${unresolvedAlias.externalKey}`);
          }

          let productId: ObjectId | undefined;
          if (resolution.action === "create") {
            productId = (
              await this.products.insertOne(
                {
                  organizationId: context.organizationId,
                  storeId: storeObjectId,
                  label: resolution.canonicalLabel,
                  normalizedLabel: normalizeExternalKey(resolution.canonicalLabel),
                  active: true,
                  createdBy: context.userId,
                  createdAt: now,
                  updatedAt: now,
                },
                { session },
              )
            ).insertedId;
          } else if (resolution.action === "merge") {
            productId = new ObjectId(resolution.productId);
            const product = await this.products.findOne(
              {
                _id: productId,
                organizationId: context.organizationId,
                storeId: storeObjectId,
                active: true,
              },
              { session, projection: { _id: 1 } },
            );
            if (!product) {
              throw new Error("Produit de fusion introuvable ou accès refusé");
            }
          }

          productIdsByExternalKey.set(
            unresolvedAlias.externalKey,
            productId?.toHexString() ?? null,
          );
        }

        await persistMercalysIdentityAliases({
          collection: this.productAliases,
          context,
          rows: includedRows,
          productIdsByExternalKey,
          session,
          now,
        });

        const preparedFacts = groupDailyImportFacts(
          includedRows,
          productIdsByExternalKey,
        );
        const productIds = [
          ...new Set(preparedFacts.map((fact) => fact.productId)),
        ].map((id) => new ObjectId(id));
        const businessDates = [
          ...new Set(preparedFacts.map((fact) => fact.businessDate)),
        ];
        const activeFacts =
          productIds.length === 0
            ? []
            : await this.facts
                .find(
                  {
                    organizationId: context.organizationId,
                    storeId: storeObjectId,
                    productId: { $in: productIds },
                    businessDate: { $in: businessDates },
                    active: true,
                  },
                  { session },
                )
                .toArray();
        const versionPlan = planDailyFactVersions({
          preparedFacts,
          activeFacts: activeFacts.map((fact) => ({
            id: fact._id.toHexString(),
            productId: fact.productId.toHexString(),
            businessDate: fact.businessDate,
            quantity: fact.quantity,
            revenueCents: fact.revenueCents,
            marginCents: fact.marginCents,
            purchaseCents: fact.purchaseCents,
            rceCents: fact.rceCents,
            vatCents: fact.vatCents,
            version: fact.version,
          })),
        });
        const changedFacts = versionPlan.changed;
        const unchangedFactCount = versionPlan.unchangedCount;

        for (const change of changedFacts) {
          const { fact } = change;
          if (change.supersedesFactId) {
            const deactivated = await this.facts.updateOne(
              { _id: new ObjectId(change.supersedesFactId), active: true },
              {
                $set: {
                  active: false,
                  supersededByImportJobId: importObjectId,
                  updatedAt: now,
                },
              },
              { session },
            );
            if (deactivated.modifiedCount !== 1) {
              throw new Error("Conflit de version sur un fait journalier");
            }
          }

          await this.facts.insertOne(
            {
              organizationId: context.organizationId,
              storeId: storeObjectId,
              departmentId: job.departmentId,
              productId: new ObjectId(fact.productId),
              businessDate: fact.businessDate,
              periodKey: fact.periodKey,
              isoWeekKey: fact.isoWeekKey,
              quantity: fact.quantity,
              revenueCents: fact.revenueCents,
              marginCents: fact.marginCents,
              purchaseCents: fact.purchaseCents,
              rceCents: fact.rceCents,
              vatCents: fact.vatCents,
              source: "mercalys_daily",
              importJobId: importObjectId,
              version: change.version,
              active: true,
              supersedesFactId: change.supersedesFactId
                ? new ObjectId(change.supersedesFactId)
                : null,
              createdBy: context.userId,
              createdAt: now,
              updatedAt: now,
            },
            { session },
          );
        }

        let dataRevision = store.dataRevision;
        if (changedFacts.length > 0) {
          const updatedStore = await this.stores.findOneAndUpdate(
            {
              _id: storeObjectId,
              organizationId: context.organizationId,
              active: true,
            },
            { $inc: { dataRevision: 1 } },
            { session, returnDocument: "after" },
          );
          if (!updatedStore) {
            throw new Error("Magasin introuvable ou accès refusé");
          }
          dataRevision = updatedStore.dataRevision;
        }

        const committedResult = dailyImportCommitResultSchema.parse({
          importId,
          status: "committed",
          importedFactCount: changedFacts.length,
          unchangedFactCount,
          ignoredRowCount: includedRows.filter(
            (row) => productIdsByExternalKey.get(row.externalKey) === null,
          ).length,
          dataRevision,
          committedAt: now.toISOString(),
        });
        const jobUpdate = await this.importJobs.updateOne(
          { _id: importObjectId, status: "preview" },
          {
            $set: {
              status: "committed",
              committedAt: now,
              committedBy: context.userId,
              committedResult,
            },
          },
          { session },
        );
        if (jobUpdate.modifiedCount !== 1) {
          throw new Error("L’import journalier a déjà été modifié");
        }

        await this.auditLogs.insertOne(
          {
            organizationId: context.organizationId,
            storeId: storeObjectId,
            actorId: context.userId,
            action: "daily_sales.import.committed",
            entityType: "dailySalesImportJob",
            entityId: importObjectId,
            before: { status: "preview" },
            after: {
              status: "committed",
              fingerprint: job.fingerprint,
              coverageKey: job.coverageKey,
              sourceStoreCode: job.preview.sourceStoreCode,
              coverage: job.preview.coverage,
              totals: job.preview.totals,
              importedFactCount: changedFacts.length,
              unchangedFactCount,
              dataRevision,
            },
            timestamp: now,
            createdAt: now,
            requestId,
          },
          { session },
        );

        return committedResult;
      });

      if (!result) {
        throw new Error("La transaction journalière n’a retourné aucun résultat");
      }
      return result;
    } finally {
      await session.endSession();
    }
  }
}
