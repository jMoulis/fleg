import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  markdownCreateInputSchema,
  markdownListQuerySchema,
  markdownListResponseSchema,
  markdownResponseSchema,
} from "@/domain/markdown/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { MarkdownReferenceError } from "@/server/repositories/markdown-repository";
import {
  createMarkdown,
  listMarkdown,
} from "@/server/services/markdown-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

function errorResponse(
  error: unknown,
  requestId: string,
  method: "GET" | "POST",
) {
  const unauthorized =
    error instanceof AuthenticationRequiredError ||
    error instanceof StoreAccessDeniedError;
  const invalid =
    error instanceof z.ZodError || error instanceof MarkdownReferenceError;
  reportUnexpectedApiError({
    error,
    expected: unauthorized || invalid,
    requestId,
    route: "/api/stores/[storeId]/markdown",
    method,
  });
  return NextResponse.json(
    apiErrorSchema.parse({
      code: unauthorized
        ? "STORE_NOT_FOUND_OR_FORBIDDEN"
        : invalid
          ? "INVALID_MARKDOWN"
          : "MARKDOWN_FAILED",
      message: unauthorized
        ? "Magasin introuvable ou accès refusé"
        : error instanceof MarkdownReferenceError
          ? error.message
          : invalid
            ? "La saisie de démarque contient des valeurs invalides"
            : "La démarque n’a pas pu être enregistrée",
      requestId,
    }),
    { status: unauthorized ? 404 : invalid ? 400 : 503 },
  );
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["analytics.read"],
      request.headers,
    );
    const url = new URL(request.url);
    const query = markdownListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );
    const markdown = await listMarkdown({ context, query });
    return NextResponse.json(
      markdownListResponseSchema.parse({ markdown, requestId }),
    );
  } catch (error) {
    return errorResponse(error, requestId, "GET");
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["markdown.write"],
      request.headers,
    );
    const createInput = markdownCreateInputSchema.parse(await request.json());
    const markdown = await createMarkdown({ context, createInput, requestId });
    return NextResponse.json(
      markdownResponseSchema.parse({ markdown, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, requestId, "POST");
  }
}
