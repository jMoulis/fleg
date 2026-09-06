import { NextResponse } from "next/server";

import {
  CopilotToolLoopError,
  storeCopilotRequestSchema,
  storeCopilotResponseSchema,
} from "@/domain/ai/copilot";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { requireStoreAiContext } from "@/server/auth/ai-context";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  CopilotConfigurationError,
  runStoreCopilot,
} from "@/server/services/copilot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

class InvalidStoreAiChatRequestError extends Error {
  constructor() {
    super("La requête de conversation magasin est invalide");
    this.name = "InvalidStoreAiChatRequestError";
  }
}

async function parseStoreAiChatRequest(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InvalidStoreAiChatRequestError();
  }

  const result = storeCopilotRequestSchema.safeParse(body);
  if (!result.success) throw new InvalidStoreAiChatRequestError();
  return result.data;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreAiContext(storeId, request.headers);
    const chat = await parseStoreAiChatRequest(request);
    const result = await runStoreCopilot({
      context,
      request: chat,
      requestId,
    });

    return NextResponse.json(
      storeCopilotResponseSchema.parse({ ...result, requestId }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const invalid = error instanceof InvalidStoreAiChatRequestError;
    const notConfigured = error instanceof CopilotConfigurationError;
    const toolLoopFailed = error instanceof CopilotToolLoopError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized || invalid || notConfigured,
      requestId,
      route: "/api/stores/[storeId]/ai/chat",
      method: "POST",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_AI_CHAT"
            : notConfigured
              ? "AI_NOT_CONFIGURED"
              : toolLoopFailed
                ? "AI_TOOL_LOOP_FAILED"
                : "AI_PROVIDER_UNAVAILABLE",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : invalid
            ? "La conversation envoyée est invalide"
            : notConfigured
              ? "Le Copilote doit être configuré côté serveur avant utilisation"
              : toolLoopFailed
                ? "Le Copilote n’a pas pu terminer son analyse avec les outils autorisés"
                : "Le fournisseur IA est temporairement indisponible",
        requestId,
      }),
      {
        status: unauthorized
          ? 404
          : invalid
            ? 400
            : notConfigured
              ? 503
              : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
