import { NextResponse } from "next/server";
import { z } from "zod";
import {
  briefPolicy,
  briefReviewSchema,
} from "@/domain/commercial-briefs/schemas";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { readBoundedUploadJson } from "@/server/http/upload-intent-request";
import {
  getCommercialBriefRepository,
  requireCommercialBrief,
  commercialBriefAvailable,
  commercialBriefEstimate,
} from "@/server/services/commercial-brief-service";
import { PhotoValidationError } from "@/domain/attachments/photo-validation";
import { getDocumentProcessingRepository } from "@/server/services/document-processing-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Route = { params: Promise<{ storeId: string; sourceId: string }> };
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("analyze"),
      consent: z.literal(true),
      pages: z
        .array(z.number().int().min(1).max(60))
        .min(1)
        .max(briefPolicy.maxPages),
    })
    .strict(),
  z.object({ action: z.literal("review"), review: briefReviewSchema }).strict(),
]);
async function handle(request: Request, route: Route, method: "GET" | "POST") {
  const headers = { "Cache-Control": "private, no-store" };
  const requestId = crypto.randomUUID();
  try {
    const { storeId, sourceId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const repository = await getCommercialBriefRepository();
    let brief;
    if (method === "GET") brief = await repository.get(context, sourceId);
    else {
      if (
        request.headers.get("origin") !== new URL(request.url).origin ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new StoreAccessDeniedError();
      const body = command.parse(await readBoundedUploadJson(request, 24_000));
      if (body.action === "analyze") {
        const { storeIds, ...config } = requireCommercialBrief(storeId);
        void storeIds;
        brief = await repository.enqueue(context, sourceId, body.pages, config);
      } else brief = await repository.review(context, sourceId, body.review);
    }
    const native = await (
      await getDocumentProcessingRepository()
    ).get(context, sourceId);
    return NextResponse.json(
      {
        brief,
        requestId,
        matches: brief ? await repository.matches(context, brief) : [],
        available: commercialBriefAvailable(storeId),
        estimate: commercialBriefEstimate(storeId),
        canAnalyze:
          context.permissions.includes("imports.create") &&
          context.permissions.includes("attachments.write"),
        canReview:
          context.permissions.includes("imports.commit") &&
          context.permissions.includes("attachments.write"),
        pages:
          native?.state === "ready"
            ? (native.result?.pages.map((p) => ({
                page: p.page,
                characters: p.text.trim().length,
              })) ?? [])
            : [],
      },
      { headers },
    );
  } catch (error) {
    const forbidden =
      error instanceof StoreAccessDeniedError ||
      error instanceof AuthenticationRequiredError;
    const status = forbidden
      ? 404
      : error instanceof z.ZodError || error instanceof PhotoValidationError
        ? 400
        : error instanceof PrivateStorageError
          ? error.code === "UPLOAD_NOT_FOUND"
            ? 404
            : 409
          : 503;
    return NextResponse.json(
      {
        requestId,
        message:
          error instanceof PrivateStorageError
            ? error.message
            : forbidden
              ? "Document introuvable ou accès refusé"
              : "Brouillon indisponible ou valeurs invalides. Actualisez avant de recommencer.",
      },
      { headers, status },
    );
  }
}
export async function GET(request: Request, route: Route) {
  return handle(request, route, "GET");
}
export async function POST(request: Request, route: Route) {
  return handle(request, route, "POST");
}
