import { NextResponse } from "next/server";

import {
  CopilotToolLoopError,
  networkCopilotRequestSchema,
  networkCopilotResponseSchema,
} from "@/domain/ai/copilot";
import { apiErrorSchema } from "@/domain/api/schemas";
import { NetworkStoreSetError } from "@/domain/network/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { requireNetworkAiContexts } from "@/server/auth/ai-context";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  CopilotConfigurationError,
  runNetworkCopilot,
} from "@/server/services/copilot-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class InvalidNetworkAiChatRequestError extends Error {
  constructor() {
    super("La requête de conversation réseau est invalide");
    this.name = "InvalidNetworkAiChatRequestError";
  }
}

async function parseNetworkAiChatRequest(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InvalidNetworkAiChatRequestError();
  }

  const result = networkCopilotRequestSchema.safeParse(body);
  if (!result.success) throw new InvalidNetworkAiChatRequestError();
  return result.data;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const chat = await parseNetworkAiChatRequest(request);
    const contexts = await requireNetworkAiContexts(
      chat.storeIds,
      request.headers,
    );
    const result = await runNetworkCopilot({ contexts, request: chat });

    return NextResponse.json(
      networkCopilotResponseSchema.parse({ ...result, requestId }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError ||
      error instanceof NetworkStoreSetError;
    const invalid = error instanceof InvalidNetworkAiChatRequestError;
    const notConfigured = error instanceof CopilotConfigurationError;
    const toolLoopFailed = error instanceof CopilotToolLoopError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized || invalid || notConfigured,
      requestId,
      route: "/api/network/ai/chat",
      method: "POST",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "NETWORK_SCOPE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_NETWORK_AI_CHAT"
            : notConfigured
              ? "AI_NOT_CONFIGURED"
              : toolLoopFailed
                ? "AI_TOOL_LOOP_FAILED"
                : "AI_PROVIDER_UNAVAILABLE",
        message: unauthorized
          ? "Périmètre réseau introuvable ou accès refusé"
          : invalid
            ? "La conversation réseau envoyée est invalide"
            : notConfigured
              ? "Le Copilote doit être configuré côté serveur avant utilisation"
              : toolLoopFailed
                ? "Le Copilote n’a pas pu terminer sa comparaison avec l’outil autorisé"
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
