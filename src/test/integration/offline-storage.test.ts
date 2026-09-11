import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetPreparedWorkspace,
  preparationEpoch,
  readPreparedWorkspace,
  savePreparedWorkspace,
} from "@/lib/offline/database";
import { preparedFixture } from "@/test/fixtures/offline";

describe("offline transactional store and account isolation", () => {
  beforeEach(async () => {
    await forgetPreparedWorkspace();
  });

  it("atomically replaces the single fully scoped reference", async () => {
    const a = preparedFixture();
    await savePreparedWorkspace(a, await preparationEpoch());
    const b = {
      ...a,
      identity: { ...a.identity, storeId: "66d000000000000000000002" },
    };
    await savePreparedWorkspace(b, await preparationEpoch());
    expect((await readPreparedWorkspace())?.identity).toEqual(b.identity);
  });

  it("does not replace a usable reference with a partial download", async () => {
    const a = preparedFixture();
    const epoch = await preparationEpoch();
    await savePreparedWorkspace(a, epoch);
    await expect(
      savePreparedWorkspace({ ...a, products: [] }, epoch),
    ).rejects.toThrow();
    expect(await readPreparedWorkspace()).toEqual(a);
  });

  it("fences a stale in-flight download after logout/account change", async () => {
    const epoch = await preparationEpoch();
    await savePreparedWorkspace(preparedFixture(), epoch);
    await forgetPreparedWorkspace();
    await expect(
      savePreparedWorkspace(preparedFixture(), epoch),
    ).rejects.toThrow("session");
    expect(await readPreparedWorkspace()).toBeNull();
  });
});
