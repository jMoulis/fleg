import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb } from "@/server/db/mongo-client";
import { DocumentSourceRepository } from "@/server/repositories/document-source-repository";
import { parsePrivateStorageConfig } from "@/server/storage/config";
import { VercelPrivateUploadObjectStore } from "@/server/storage/private-upload-object";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  route: { params: Promise<{ storeId: string; sourceId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, sourceId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const content = await new DocumentSourceRepository(
      await getAppDb(),
    ).content(
      context,
      sourceId,
      new VercelPrivateUploadObjectStore(
        parsePrivateStorageConfig(process.env),
      ),
    );
    await requireStoreContext(storeId, ["stores.read"], request.headers);
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= content.bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 64 * 1024, content.bytes.length);
        controller.enqueue(content.bytes.subarray(offset, end));
        offset = end;
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(content.originalFileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments/documents/[sourceId]/content",
      method: "GET",
    });
  }
}
