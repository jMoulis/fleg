import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/store-context", () => ({ requireStoreContext: auth }));
vi.mock("@/server/services/attachment-service", () => ({
  listPhotoAttachments: vi.fn(() => {
    throw new Error("Unexpected database access");
  }),
}));
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { POST } from "@/app/api/stores/[storeId]/attachments/route";

describe("legacy BSON upload admission", () => {
  it("refuses old clients before reading any file, even with valid write access", async () => {
    auth.mockResolvedValueOnce({ userId: "owner" });
    const request = new Request("http://localhost/api/stores/abc/attachments", {
      method: "POST",
      body: "unused bytes",
    });
    const read = vi.spyOn(request, "formData");
    const response = await POST(request, {
      params: Promise.resolve({ storeId: "abc" }),
    });
    expect(auth).toHaveBeenLastCalledWith(
      "abc",
      ["attachments.write"],
      request.headers,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "STORAGE_DISABLED" });
    expect(read).not.toHaveBeenCalled();
  });
  it("still hides unauthorized stores", async () => {
    auth.mockRejectedValueOnce(new StoreAccessDeniedError());
    const response = await POST(
      new Request("http://localhost/api/stores/foreign/attachments", {
        method: "POST",
      }),
      { params: Promise.resolve({ storeId: "foreign" }) },
    );
    expect(response.status).toBe(404);
  });
});
