import "server-only";

import { Db, ObjectId } from "mongodb";

import type {
  GranularDailyFactValue,
  GranularMonthlyFactValue,
} from "@/domain/analytics/granular-sales";
import { buildGranularSalesScope } from "@/domain/analytics/granular-sales-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface DailySalesFactDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: ObjectId;
  businessDate: string;
  isoWeekKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
  version: number;
  active: boolean;
}

interface MonthlySalesFactDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: ObjectId;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

export class GranularSalesProductNotFoundError extends Error {
  constructor() {
    super("Produit introuvable ou accès refusé");
    this.name = "GranularSalesProductNotFoundError";
  }
}

export class GranularSalesRepository {
  private readonly dailyFacts;
  private readonly monthlyFacts;
  private readonly products;
  private readonly stores;

  constructor(db: Db) {
    this.dailyFacts = db.collection<DailySalesFactDocument>("dailySalesFacts");
    this.monthlyFacts = db.collection<MonthlySalesFactDocument>("salesFacts");
    this.products = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      active: boolean;
    }>("products");
    this.stores = db.collection<{
      organizationId: string;
      active: boolean;
      dataRevision: number;
    }>("stores");
  }

  private objectScope(context: AuthorizedStoreContext) {
    const scope = buildGranularSalesScope(context);
    return {
      organizationId: scope.organizationId,
      storeId: new ObjectId(scope.storeId),
    };
  }

  async requireProduct(
    context: AuthorizedStoreContext,
    productId: string | undefined,
  ): Promise<ObjectId | undefined> {
    if (!productId) {
      return undefined;
    }

    const productObjectId = new ObjectId(productId);
    const product = await this.products.findOne(
      {
        _id: productObjectId,
        ...this.objectScope(context),
        active: true,
      },
      { projection: { _id: 1 } },
    );
    if (!product) {
      throw new GranularSalesProductNotFoundError();
    }

    return productObjectId;
  }

  async findLatestBusinessDate(
    context: AuthorizedStoreContext,
    productId?: ObjectId,
  ): Promise<string | null> {
    const fact = await this.dailyFacts.findOne(
      {
        ...this.objectScope(context),
        ...(productId ? { productId } : {}),
        active: true,
      },
      { sort: { businessDate: -1 }, projection: { businessDate: 1 } },
    );
    return fact?.businessDate ?? null;
  }

  async findDailyFacts(input: {
    context: AuthorizedStoreContext;
    from: string;
    to: string;
    productId?: ObjectId;
  }): Promise<GranularDailyFactValue[]> {
    const facts = await this.dailyFacts
      .find(
        {
          ...this.objectScope(input.context),
          ...(input.productId ? { productId: input.productId } : {}),
          businessDate: { $gte: input.from, $lte: input.to },
          active: true,
        },
        { sort: { businessDate: 1, productId: 1 } },
      )
      .toArray();

    return facts.map((fact) => ({
      productId: fact.productId.toHexString(),
      businessDate: fact.businessDate,
      isoWeekKey: fact.isoWeekKey,
      quantity: fact.quantity,
      revenueCents: fact.revenueCents,
      marginCents: fact.marginCents,
      version: fact.version,
    }));
  }

  async findMonthlyFacts(input: {
    context: AuthorizedStoreContext;
    periodKey: string;
    productId?: ObjectId;
  }): Promise<GranularMonthlyFactValue[]> {
    const facts = await this.monthlyFacts
      .find({
        ...this.objectScope(input.context),
        ...(input.productId ? { productId: input.productId } : {}),
        periodKey: input.periodKey,
      })
      .toArray();

    return facts.map((fact) => ({
      productId: fact.productId.toHexString(),
      quantity: fact.quantity,
      revenueCents: fact.revenueCents,
      marginCents: fact.marginCents,
    }));
  }

  async getDataRevision(context: AuthorizedStoreContext): Promise<number> {
    const scope = buildGranularSalesScope(context);
    const store = await this.stores.findOne(
      {
        _id: new ObjectId(scope.storeId),
        organizationId: scope.organizationId,
        active: true,
      },
      { projection: { dataRevision: 1 } },
    );
    if (!store) {
      throw new Error("Magasin introuvable ou accès refusé");
    }
    return store.dataRevision;
  }
}
