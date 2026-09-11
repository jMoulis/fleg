import "server-only";

import { Db, ObjectId } from "mongodb";

import {
  productOptionSchema,
  type ProductOption,
} from "@/domain/products/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface ProductDocument {
  organizationId: string;
  storeId: ObjectId;
  label: string;
  normalizedLabel: string;
  active: boolean;
}

export class ProductRepository {
  private readonly products;

  constructor(db: Db) {
    this.products = db.collection<ProductDocument>("products");
  }

  async listOptions(
    context: AuthorizedStoreContext,
    limit = 1_000,
  ): Promise<ProductOption[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 2_001) {
      throw new Error("Limite de catalogue invalide");
    }
    const products = await this.products
      .find(
        {
          organizationId: context.organizationId,
          storeId: new ObjectId(context.storeId),
          active: true,
        },
        { projection: { label: 1 } },
      )
      .sort({ label: 1 })
      .limit(limit)
      .toArray();

    return products.map((product) =>
      productOptionSchema.parse({
        id: product._id.toHexString(),
        label: product.label,
      }),
    );
  }
}
