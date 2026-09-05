import * as z from "zod";

import { reportServerError } from "@/server/observability/logger";

interface InstrumentedRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface InstrumentedErrorContext {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "proxy";
}

function requestIdFromHeaders(
  headers: InstrumentedRequest["headers"],
): string {
  const candidate = headers["x-request-id"];
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  return z.uuid().safeParse(value).success ? (value as string) : crypto.randomUUID();
}

export function register(): void {}

export function onRequestError(
  error: unknown,
  request: InstrumentedRequest,
  context: InstrumentedErrorContext,
): void {
  reportServerError({
    event: "next.request.unhandled_error",
    requestId: requestIdFromHeaders(request.headers),
    message: "Une requête Next.js a échoué sans être traitée",
    error,
    route: context.routePath || request.path,
    method: request.method,
    statusCode: 500,
    context: {
      routerKind: context.routerKind,
      routeType: context.routeType,
    },
  });
}
