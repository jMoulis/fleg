import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStoreContext } from "@/server/auth/store-context";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";
import {
  getDocumentProcessingRepository,
  requireDocumentProcessing,
} from "@/server/services/document-processing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Route = { params: Promise<{ storeId: string; sourceId: string }> };
async function handle(
  request: Request,
  route: Route,
  method: "GET" | "POST" | "DELETE",
) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, sourceId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      [method === "GET" ? "stores.read" : "attachments.write"],
      request.headers,
    );
    if (method === "POST") requireDocumentProcessing(storeId);
    if (method !== "GET")
      z.object({})
        .strict()
        .parse(await readUploadIntentRequest(request));
    const repository = await getDocumentProcessingRepository();
    const job =
      method === "GET"
        ? await repository.get(context, sourceId)
        : method === "POST"
          ? await repository.enqueue(context, sourceId)
          : await repository.cancel(context, sourceId);
    return NextResponse.json(
      { job, requestId },
      {
        status: method === "POST" ? 202 : 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      method,
      route:
        "/api/stores/[storeId]/attachments/documents/[sourceId]/processing",
    });
  }
}
export async function GET(request: Request, route: Route) {
  return handle(request, route, "GET");
}
export async function POST(request: Request, route: Route) {
  return handle(request, route, "POST");
}
export async function DELETE(request: Request, route: Route) {
  return handle(request, route, "DELETE");
}
