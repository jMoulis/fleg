import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  layoutVersionSchema,
  type LayoutVersion,
  type LayoutVersionCreateInput,
} from "@/domain/space/schemas";
import { buildLayoutVersionScope } from "@/domain/space/store-scope";
import { buildNextLayoutVersion } from "@/domain/space/versioning";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface LayoutVersionDocument
  extends Omit<
    LayoutVersion,
    "id" | "storeId" | "departmentId" | "createdAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  seedKey?: string;
  idempotencyKey?: string;
  basedOnVersion?: number;
  createdAt: Date;
}

export class LayoutVersionConflictError extends Error {
  readonly code = "LAYOUT_VERSION_CONFLICT";

  constructor() {
    super("Le plan a changé depuis l'ouverture de l'éditeur");
    this.name = "LayoutVersionConflictError";
  }
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

export class LayoutRepository {
  private readonly layoutVersions;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.layoutVersions =
      db.collection<LayoutVersionDocument>("layoutVersions");
    this.auditLogs = db.collection("auditLogs");
  }

  async getLatestForStore(
    context: AuthorizedStoreContext,
  ): Promise<LayoutVersion | null> {
    const scope = buildLayoutVersionScope(context);
    const document = await this.layoutVersions.findOne(
      {
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        departmentKey: "fruit_vegetable",
      },
      { sort: { version: -1, createdAt: -1 } },
    );

    return document ? toLayoutVersion(document) : null;
  }

  async createNextVersion(input: {
    context: AuthorizedStoreContext;
    createInput: LayoutVersionCreateInput;
    requestId: string;
  }): Promise<LayoutVersion> {
    const { context, createInput, requestId } = input;
    const scope = buildLayoutVersionScope(context);
    const storeId = new ObjectId(scope.storeId);
    const idempotencyFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: createInput.idempotencyKey,
    };
    const existing = await this.layoutVersions.findOne(idempotencyFilter);

    if (existing) {
      return toLayoutVersion(existing);
    }

    if (!this.client) {
      throw new Error("Client Mongo requis pour créer une version de plan");
    }

    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const current = await this.layoutVersions.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            departmentKey: "fruit_vegetable",
          },
          { sort: { version: -1, createdAt: -1 }, session },
        );

        if (!current || current.version !== createInput.basedOnVersion) {
          throw new LayoutVersionConflictError();
        }

        const previousLayout = toLayoutVersion(current);
        const createdAt = new Date();
        const nextLayout = buildNextLayoutVersion({
          current: previousLayout,
          createInput,
          id: new ObjectId().toHexString(),
          actorUserId: context.userId,
          createdAt: createdAt.toISOString(),
        });
        const { id, ...layoutValues } = nextLayout;
        const layoutObjectId = new ObjectId(id);

        await this.layoutVersions.insertOne(
          {
            ...layoutValues,
            _id: layoutObjectId,
            storeId,
            departmentId: current.departmentId,
            createdAt,
            idempotencyKey: createInput.idempotencyKey,
            basedOnVersion: createInput.basedOnVersion,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "layout.version.created",
            entityType: "layoutVersion",
            entityId: layoutObjectId,
            before: previousLayout,
            after: nextLayout,
            requestId,
            timestamp: createdAt,
            createdAt,
          },
          { session },
        );

        return nextLayout;
      });

      if (!result) {
        throw new Error("La version du plan n'a pas été créée");
      }

      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const duplicate = await this.layoutVersions.findOne(idempotencyFilter);

        if (duplicate) {
          return toLayoutVersion(duplicate);
        }

        throw new LayoutVersionConflictError();
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }
}
