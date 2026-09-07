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
        "store_admin_commands_scope_key_unique",
        "store_membership_commands_scope_key_unique",
        "notification_deliveries_key_unique",
        "notification_deliveries_invitation_latest",
        "products_scope_active_label",
        "sales_facts_scope_period",
        "store_settings_scope_unique",
        "store_configuration_commands_scope_key_unique",
        "recommendations_network_period_status",
        "recommendation_follow_ups_decision_unique",
        "recommendation_follow_ups_scope_due",
        "recommendation_follow_up_commands_scope_key_unique",
        "product_space_policy_sets_scope_unique",
        "product_space_policy_commands_scope_key_unique",
      ]),
    );
  });

  it("replaces legacy sparse layout indexes with string partial indexes", async () => {
    const droppedNames: string[] = [];
    const createdOptions = new Map<string, Record<string, unknown>>();
    const collection = (name: string) => ({
      createIndex: async (
        _key: Record<string, number>,
        options: Record<string, unknown> & { name: string },
      ) => {
        createdOptions.set(options.name, options);
        return options.name;
      },
      listIndexes: () => ({
        toArray: async () =>
          name === "layoutVersions"
            ? [
                {
                  name: "layout_versions_scope_seed_unique",
                  sparse: true,
                },
                {
                  name: "layout_versions_scope_idempotency_unique",
                  sparse: true,
                },
              ]
            : [],
      }),
      dropIndex: async (indexName: string) => {
        droppedNames.push(indexName);
      },
    });
    const db = { collection } as unknown as Db;

    await ensureFoundationIndexesForDb(db);

    expect(droppedNames).toEqual([
      "layout_versions_scope_seed_unique",
      "layout_versions_scope_idempotency_unique",
    ]);
    expect(
      createdOptions.get("layout_versions_scope_seed_unique"),
    ).toMatchObject({
      unique: true,
      partialFilterExpression: { seedKey: { $type: "string" } },
    });
    expect(
      createdOptions.get("layout_versions_scope_idempotency_unique"),
    ).toMatchObject({
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
    });
  });
});
