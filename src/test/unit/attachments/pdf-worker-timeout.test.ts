import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ terminate: vi.fn().mockResolvedValue(0) }));
vi.mock("server-only", () => ({}));
vi.mock("node:worker_threads", () => ({
  Worker: class extends EventEmitter {
    terminate = mocks.terminate;
  },
}));
import { validatePdf } from "@/server/storage/pdf-validator";
describe("PDF worker deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("terminates a nonresponsive parser and frees its concurrency slot", async () => {
    vi.useFakeTimers();
    for (let attempt = 0; attempt < 2; attempt++) {
      const promise = validatePdf(new TextEncoder().encode("%PDF-1.7\n"));
      const rejection = expect(promise).rejects.toMatchObject({
        code: "STORAGE_INTEGRITY",
      });
      await vi.advanceTimersByTimeAsync(10000);
      await rejection;
    }
    expect(mocks.terminate).toHaveBeenCalledTimes(2);
  });
});
