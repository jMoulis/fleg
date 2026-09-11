import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.session }));
import { assertInventorySessionBinding } from "@/server/http/inventory-session-binding";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";

describe("unified inventory session fence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ session: { id: "current-session" } });
  });
  it("preserves the already store-authorized API contract when no local binding is supplied", async () => {
    await assertInventorySessionBinding(new Headers());
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("accepts only the exact online session for a local validation or correction", async () => {
    const binding = createHash("sha256")
      .update("current-session")
      .digest("hex");
    await assertInventorySessionBinding(
      new Headers({ "x-fleg-session-binding": binding }),
    );
    for (const value of ["", "old-session", "0".repeat(64)])
      await expect(
        assertInventorySessionBinding(
          new Headers({ "x-fleg-session-binding": value }),
        ),
      ).rejects.toBeInstanceOf(StoreAccessDeniedError);
  });
  it("propagates a revoked online session", async () => {
    mocks.session.mockRejectedValue(new StoreAccessDeniedError());
    await expect(
      assertInventorySessionBinding(
        new Headers({ "x-fleg-session-binding": "x" }),
      ),
    ).rejects.toBeInstanceOf(StoreAccessDeniedError);
  });
});
