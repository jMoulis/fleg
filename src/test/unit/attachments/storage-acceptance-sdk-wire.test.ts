import { afterEach, expect, it, vi } from "vitest";
import { get, put } from "@vercel/blob";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import {
  acceptanceFixtures,
  acceptanceStoreId,
} from "@/scripts/storage-acceptance/probe";

afterEach(() => vi.unstubAllEnvs());

it("SDK 2.8.0 put.contentType emits x-content-type (not the HTTP entity type), without network", async () => {
  vi.stubEnv("VERCEL_BLOB_RETRIES", "0");
  const dispatcher = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect(); // any unmatched request MUST fail locally
  setGlobalDispatcher(mock);
  try {
    const png = acceptanceFixtures("986b43b3-9a6e-44d0-bada-d703755463df")[0]!;
    const captured: Record<string, string>[] = [];
    mock
      .get("https://vercel.com")
      .intercept({
        path: `/api/blob/?pathname=${encodeURIComponent(png.reference.pathname)}`,
        method: "PUT",
        headers: (headers) => {
          captured.push(headers);
          return true;
        },
      })
      .reply(
        200,
        {
          url: "https://private.example/synthetic.png",
          downloadUrl: "https://private.example/synthetic.png?download=1",
          pathname: png.reference.pathname,
          contentType: "text/plain",
          contentDisposition: "attachment",
        },
        { headers: { "content-type": "application/json" } },
      );
    await put(png.reference.pathname, Buffer.from(png.bytes), {
      token: `vercel_blob_rw_${acceptanceStoreId.slice(6)}_hermetic`,
      access: "private",
      contentType: "text/plain",
      addRandomSuffix: false,
      allowOverwrite: false,
      abortSignal: AbortSignal.timeout(2000),
    });
    mock.assertNoPendingInterceptors();
    expect(captured.length).toBeGreaterThan(0);
    for (const headers of captured) {
      expect(headers["x-content-type"]).toBe("text/plain");
      expect(headers["content-type"]).toBeUndefined();
      expect(headers["x-vercel-blob-access"]).toBe("private");
      expect(headers["x-api-blob-request-attempt"]).toBe("0");
    }
  } finally {
    setGlobalDispatcher(dispatcher);
    await mock.close();
  }
});

it("SDK private get distinguishes 404 from 5xx and exposes the origin response headers", async () => {
  const dispatcher = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  try {
    const png = acceptanceFixtures("986b43b3-9a6e-44d0-bada-d703755463df")[0]!;
    const pool = mock.get(
      `https://${acceptanceStoreId.slice(6).toLowerCase()}.private.blob.vercel-storage.com`,
    );
    const request = {
      method: "GET",
      path: `/${png.reference.pathname}?cache=0`,
    };
    const options = {
      token: `vercel_blob_rw_${acceptanceStoreId.slice(6)}_hermetic`,
      access: "private" as const,
      useCache: false,
      abortSignal: AbortSignal.timeout(2000),
    };
    pool
      .intercept(request)
      .reply(200, "abc", {
        headers: { "content-length": "3", "content-type": "text/plain" },
      });
    const response = await get(png.reference.pathname, options);
    expect(response?.blob).toMatchObject({
      pathname: png.reference.pathname,
      size: 3,
      contentType: "text/plain",
    });
    expect(response?.headers.get("content-type")).toBe("text/plain");
    await response?.stream?.cancel();
    pool.intercept(request).reply(404);
    expect(await get(png.reference.pathname, options)).toBeNull();
    pool.intercept(request).reply(503);
    await expect(get(png.reference.pathname, options)).rejects.toThrow();
    mock.assertNoPendingInterceptors();
  } finally {
    setGlobalDispatcher(dispatcher);
    await mock.close();
  }
});
