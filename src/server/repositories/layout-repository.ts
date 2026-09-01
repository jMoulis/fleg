import "server-only";

import { Db, ObjectId, type WithId } from "mongodb";

import {
  layoutVersionSchema,
  type LayoutVersion,
} from "@/domain/space/schemas";
import { buildLayoutVersionScope } from "@/domain/space/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface LayoutVersionDocument
  extends Omit<
    LayoutVersion,
    "id" | "storeId" | "departmentId" | "createdAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  seedKey?: string;
  createdAt: Date;
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

  constructor(db: Db) {
    this.layoutVersions =
      db.collection<LayoutVersionDocument>("layoutVersions");
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
}

