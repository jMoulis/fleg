import { NextResponse } from "next/server";
import * as z from "zod";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb } from "@/server/db/mongo-client";
import { DocumentSourceRepository } from "@/server/repositories/document-source-repository";
import { documentSourceIdSchema } from "@/domain/attachments/document-source";
import { attachmentErrorResponse } from "@/server/http/attachment-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  route: { params: Promise<{ storeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const query = z
      .object({ cursor: documentSourceIdSchema.optional() })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await new DocumentSourceRepository(await getAppDb()).list(
      context,
      query.cursor,
    );
    return NextResponse.json(
      { ...result, requestId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return attachmentErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/attachments/documents",
      method: "GET",
    });
  }
}
