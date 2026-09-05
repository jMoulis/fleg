import "server-only";

import { reportServerError } from "@/server/observability/logger";

interface ReportUnexpectedApiErrorInput {
  error: unknown;
  expected: boolean;
  requestId: string;
  route: string;
  method: string;
}

export function reportUnexpectedApiError({
  error,
  expected,
  requestId,
  route,
  method,
}: ReportUnexpectedApiErrorInput): void {
  if (expected) return;

  reportServerError({
    event: "api.request.failed",
    requestId,
    message: "Une route applicative a échoué",
    error,
    route,
    method,
    statusCode: 503,
  });
}
