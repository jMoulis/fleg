import { describe, expect, it } from "vitest";
import {
  businessDateAt,
  createLocalInventoryDraft,
  draftScope,
  inspectLocalLine,
  localInventoryDraftSchema,
} from "@/domain/offline/inventory-draft";
import { preparedFixture } from "@/test/fixtures/offline";

const copy = preparedFixture(2);
const create = () =>
  createLocalInventoryDraft(copy, copy.preparedAt, crypto.randomUUID());

describe("local inventory values and immutable references", () => {
  it("keeps raw unfinished input and blank distinct from explicit zero", () => {
    const line = {
      ...create().lines[0]!,
      familyCode: "3400" as const,
      stockUnit: "kg" as const,
      packSize: "18,5",
      reserveCaseCount: "0",
      shelfQuantity: "",
    };
    expect(inspectLocalLine(line).state).toBe("incomplete");
    expect(inspectLocalLine({ ...line, shelfQuantity: "0" })).toMatchObject({
      state: "complete",
      total: 0,
    });
    expect(
      inspectLocalLine({
        ...line,
        reserveCaseCount: "2",
        shelfQuantity: "3,25",
      }).total,
    ).toBe(40.25);
    for (const input of ["1,", "-", "1e3", "Infinity", "1.2.3"]) {
      expect(inspectLocalLine({ ...line, shelfQuantity: input }).state).toBe(
        "incomplete",
      );
      expect(
        localInventoryDraftSchema.parse({
          ...create(),
          lines: [{ ...line, shelfQuantity: input }],
        }).lines[0].shelfQuantity,
      ).toBe(input);
    }
    expect(
      inspectLocalLine({
        ...line,
        stockUnit: "piece",
        packSize: "9",
        shelfQuantity: "1,5",
      }).state,
    ).toBe("incomplete");
    expect(
      inspectLocalLine({ ...line, packSize: "9", shelfQuantity: "-1" }),
    ).toMatchObject({
      state: "complete",
      total: -1,
      message: "Total négatif à vérifier",
    });
  });

  it("freezes the count packaging over the current profile and tracks the server base", () => {
    const workspace = preparedFixture(1);
    workspace.countReference = {
      id: "a".repeat(24),
      status: "draft",
      revision: 3,
      version: 2,
    };
    workspace.products[0].profile = {
      familyCode: "3402",
      stockUnit: "piece",
      lastPackSize: 12,
      revision: 9,
    };
    workspace.products[0].countLine = {
      productId: workspace.products[0].id,
      familyCode: "3400",
      stockUnit: "kg",
      packSize: 18.5,
      reserveCaseCount: 0,
      shelfQuantity: null,
    };
    const draft = createLocalInventoryDraft(
      workspace,
      workspace.preparedAt,
      crypto.randomUUID(),
    );
    expect(draft).toMatchObject({
      baseRevision: 3,
      serverCountId: "a".repeat(24),
      status: "local_only",
    });
    expect(draft.lines[0]).toMatchObject({
      stockUnit: "kg",
      packSize: "18.5",
      reserveCaseCount: "0",
      shelfQuantity: "",
      observedAt: null,
    });
    workspace.products[0].profile.lastPackSize = 99;
    expect(draft.lines[0].packSize).toBe("18.5");
  });

  it("namespaces by owner/store/date, permits reauthentication, and handles local midnight", () => {
    expect(draftScope(copy)).toBe(
      draftScope({
        ...copy,
        identity: { ...copy.identity, sessionBinding: "b".repeat(64) },
      }),
    );
    for (const key of ["userId", "organizationId", "storeId"] as const)
      expect(
        draftScope({
          ...copy,
          identity: { ...copy.identity, [key]: "different" },
        }),
      ).not.toBe(draftScope(copy));
    expect(draftScope({ ...copy, businessDate: "2026-09-12" })).not.toBe(
      draftScope(copy),
    );
    expect(
      businessDateAt(Date.parse("2026-09-11T22:30:00Z"), "Europe/Paris"),
    ).toBe("2026-09-12");
    expect(create().businessDate).toBe("2026-09-11");
  });
});
