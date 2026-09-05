import "server-only";

import {
  operationalLogSchema,
  redactOperationalText,
  type OperationalLog,
} from "@/domain/operations/logging";

interface ReportServerErrorInput {
  event: string;
  requestId: string;
  message: string;
  error?: unknown;
  route?: string;
  method?: string;
  statusCode?: number;
  context?: Record<string, string>;
}

function normalizeError(error: unknown): OperationalLog["error"] {
  if (!(error instanceof Error)) return undefined;

  const name = redactOperationalText(error.name).slice(0, 200).trim();
  const message = redactOperationalText(error.message).slice(0, 2_000).trim();
  const stack = error.stack
    ? redactOperationalText(error.stack).slice(0, 12_000).trim()
    : "";

  return {
    name: name || "Error",
    message: message || "Erreur sans message",
    ...(stack ? { stack } : {}),
  };
}

function normalizeContext(
  context: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!context) return undefined;
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      redactOperationalText(value),
    ]),
  );
}

function writeLog(
  severity: OperationalLog["severity"],
  input: ReportServerErrorInput,
): void {
  const record = operationalLogSchema.parse({
    timestamp: new Date().toISOString(),
    severity,
    event: input.event,
    message: redactOperationalText(input.message),
    requestId: input.requestId,
    route: input.route,
    method: input.method,
    statusCode: input.statusCode,
    context: normalizeContext(input.context),
    error: normalizeError(input.error),
  });
  const output = JSON.stringify(record);

  if (severity === "error") {
    console.error(output);
  } else {
    console.warn(output);
  }
}

export function reportServerError(input: ReportServerErrorInput): void {
  writeLog("error", input);
}

export function reportServerWarning(input: ReportServerErrorInput): void {
  writeLog("warning", input);
}
