import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";

import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";

describe("foundation indexes", () => {
  it("creates the indexes used by store, network and settings queries", async () => {
    const createdNames: string[] = [];
    const collection = () => ({
      createIndex: async (
        _key: Record<string, number>,
        options: { name: string },
      ) => {
        createdNames.push(options.name);
        return options.name;
      },
      listIndexes: () => ({ toArray: async () => [] }),
      dropIndex: async () => undefined,
    });
    const db = { collection } as unknown as Db;

    await ensureFoundationIndexesForDb(db);

    expect(createdNames).toEqual(
      expect.arrayContaining([
        "stores_org_active_name",
        "store_memberships_user_active_scope",
        "products_scope_active_label",
        "sales_facts_scope_period",
        "store_settings_scope_unique",
        "recommendations_network_period_status",
      ]),
    );
  });
});
