import "server-only";

import { Db, MongoClient, ObjectId } from "mongodb";

import {
  groupImportFacts,
  validateAliasResolutions,
} from "@/domain/imports/import-commit";
import { normalizeExternalKey } from "@/domain/imports/normalization";
import {
  importCommitResultSchema,
  type AliasResolution,
  type ImportCommitResult,
  type MercalysPreview,
} from "@/domain/imports/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface UnresolvedAlias {
  externalKey: string;
  sourceLabel: string;
}

interface ImportJobDocument {
  organizationId: string;
  storeId: ObjectId;
  source: "mercalys";
  fingerprint: string;
  periodKey: string;
  status: "preview" | "committed";
  sourceFile: {
    name: string;
    size: number;
  };
  preview: MercalysPreview;
  unresolvedAliases: UnresolvedAlias[];
  createdBy: string;
  createdAt: Date;
  committedAt?: Date;
  committedBy?: string;
  committedResult?: ImportCommitResult;
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

interface ProductAliasDocument {
  organizationId: string;
  storeId: ObjectId;
  source: "mercalys";
  externalKey: string;
  sourceLabel: string;
  productId?: ObjectId;
  ignored: boolean;
  createdBy: string;
  createdAt: Date;
}

interface SalesFactDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: ObjectId;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
  source: "mercalys";
  importJobId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportPreviewRecord {
  importId: string;
  fingerprint: string;
  preview: MercalysPreview;
  unresolvedAliases: UnresolvedAlias[];
}

function toPreviewRecord(
  document: ImportJobDocument & { _id: ObjectId },
): ImportPreviewRecord {
  return {
    importId: document._id.toHexString(),
    fingerprint: document.fingerprint,
    preview: document.preview,
    unresolvedAliases: document.unresolvedAliases,
  };
}

export class ImportRepository {
  private readonly importJobs;
  private readonly productAliases;
  private readonly products;
  private readonly salesFacts;
  private readonly stores;
  private readonly auditLogs;

  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
  ) {
    this.importJobs = db.collection<ImportJobDocument>("importJobs");
    this.productAliases = db.collection<ProductAliasDocument>("productAliases");
    this.products = db.collection<ProductDocument>("products");
    this.salesFacts = db.collection<SalesFactDocument>("salesFacts");
    this.stores = db.collection<{ dataRevision: number; active: boolean }>("stores");
    this.auditLogs = db.collection("auditLogs");
  }

  async findResolvedExternalKeys(
    context: AuthorizedStoreContext,
    externalKeys: string[],
  ): Promise<Set<string>> {
    if (externalKeys.length === 0) {
      return new Set();
    }

    const aliases = await this.productAliases
      .find(
        {
          organizationId: context.organizationId,
          storeId: new ObjectId(context.storeId),
          source: "mercalys",
          externalKey: { $in: externalKeys },
        },
        { projection: { externalKey: 1 } },
      )
      .toArray();

    return new Set(aliases.map((alias) => alias.externalKey));
  }

  async savePreview(input: {
    context: AuthorizedStoreContext;
    fingerprint: string;
    fileName: string;
    fileSize: number;
    preview: MercalysPreview;
    unresolvedAliases: UnresolvedAlias[];
  }): Promise<ImportPreviewRecord> {
    const { context, fingerprint, fileName, fileSize, preview, unresolvedAliases } =
      input;
    const filter = {
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      fingerprint,
      periodKey: preview.periodKey,
    };

    await this.importJobs.updateOne(
      filter,
      {
        $setOnInsert: {
          ...filter,
          source: "mercalys",
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
      throw new Error("Import preview could not be persisted");
    }

    return toPreviewRecord(document);
  }

  async commit(input: {
    context: AuthorizedStoreContext;
    importId: string;
    resolutions: AliasResolution[];
    requestId: string;
  }): Promise<ImportCommitResult> {
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
          throw new Error("Import introuvable ou accès refusé");
        }

        if (job.status === "committed" && job.committedResult) {
          return job.committedResult;
        }

        const resolutionMap = validateAliasResolutions(
          job.unresolvedAliases.map(({ externalKey }) => externalKey),
          resolutions,
        );
        const externalKeys = [
          ...new Set(
            job.preview.rows
              .filter((row) => !row.excluded)
              .map((row) => row.externalKey),
          ),
        ];
        const existingAliases = await this.productAliases
          .find(
            {
              organizationId: context.organizationId,
              storeId: storeObjectId,
              source: "mercalys",
              externalKey: { $in: externalKeys },
            },
            { session },
          )
          .toArray();
        const productIdsByExternalKey = new Map<string, string | null>(
          existingAliases.map((alias) => [
            alias.externalKey,
            alias.ignored ? null : (alias.productId?.toHexString() ?? null),
          ]),
        );

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
            const now = new Date();
            const created = await this.products.insertOne(
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
            );
            productId = created.insertedId;
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

          await this.productAliases.insertOne(
            {
              organizationId: context.organizationId,
              storeId: storeObjectId,
              source: "mercalys",
              externalKey: unresolvedAlias.externalKey,
              sourceLabel: unresolvedAlias.sourceLabel,
              productId,
              ignored: resolution.action === "ignore",
              createdBy: context.userId,
              createdAt: new Date(),
            },
            { session },
          );
          productIdsByExternalKey.set(
            unresolvedAlias.externalKey,
            productId?.toHexString() ?? null,
          );
        }

        const preparedFacts = groupImportFacts(
          job.preview.rows,
          productIdsByExternalKey,
        );
        const now = new Date();

        if (preparedFacts.length > 0) {
          await this.salesFacts.bulkWrite(
            preparedFacts.map((fact) => ({
              updateOne: {
                filter: {
                  organizationId: context.organizationId,
                  storeId: storeObjectId,
                  periodKey: fact.periodKey,
                  productId: new ObjectId(fact.productId),
                },
                update: {
                  $set: {
                    quantity: fact.quantity,
                    revenueCents: fact.revenueCents,
                    marginCents: fact.marginCents,
                    source: "mercalys" as const,
                    importJobId: importObjectId,
                    updatedAt: now,
                  },
                  $setOnInsert: { createdAt: now },
                },
                upsert: true,
              },
            })),
            { session },
          );
        }

        const store = await this.stores.findOneAndUpdate(
          {
            _id: storeObjectId,
            organizationId: context.organizationId,
            active: true,
          },
          { $inc: { dataRevision: 1 } },
          { session, returnDocument: "after" },
        );

        if (!store) {
          throw new Error("Magasin introuvable ou accès refusé");
        }

        const committedResult = importCommitResultSchema.parse({
          importId,
          status: "committed",
          importedFactCount: preparedFacts.length,
          ignoredRowCount: job.preview.rows.filter(
            (row) =>
              !row.excluded && productIdsByExternalKey.get(row.externalKey) === null,
          ).length,
          dataRevision: store.dataRevision,
          committedAt: now.toISOString(),
        });

        const commitUpdate = await this.importJobs.updateOne(
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

        if (commitUpdate.modifiedCount !== 1) {
          throw new Error("L’import a déjà été modifié");
        }

        await this.auditLogs.insertOne(
          {
            organizationId: context.organizationId,
            storeId: storeObjectId,
            actorId: context.userId,
            action: "import.commit",
            entityType: "importJob",
            entityId: importObjectId,
            before: { status: "preview" },
            after: {
              status: "committed",
              fingerprint: job.fingerprint,
              periodKey: job.periodKey,
              totals: job.preview.totals,
              dataRevision: store.dataRevision,
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
        throw new Error("La transaction d’import n’a retourné aucun résultat");
      }

      return result;
    } finally {
      await session.endSession();
    }
  }
}
