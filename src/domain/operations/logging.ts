import * as z from "zod";

const sensitiveJsonValuePattern =
  /(\"(?:api[_-]?key|authorization|password|secret|token)\"\s*:\s*)\"[^\"]*\"/gi;
const sensitiveQueryValuePattern =
  /([?&](?:api[_-]?key|authorization|password|secret|token)=)[^&\s]+/gi;
const bearerTokenPattern = /\bBearer\s+[^\s,;]+/gi;
const openAiTokenPattern = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const mongoCredentialPattern =
  /(mongodb(?:\+srv)?:\/\/)[^@\s/]+(?::[^@\s]*)?@/gi;

export const operationalLogSchema = z.object({
  timestamp: z.iso.datetime(),
  severity: z.enum(["warning", "error"]),
  event: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2_000),
  requestId: z.uuid(),
  route: z.string().trim().min(1).max(500).optional(),
  method: z.string().trim().min(1).max(16).optional(),
  statusCode: z.number().int().min(400).max(599).optional(),
  context: z.record(z.string(), z.string()).optional(),
  error: z
    .object({
      name: z.string().trim().min(1).max(200),
      message: z.string().trim().min(1).max(2_000),
      stack: z.string().trim().min(1).max(12_000).optional(),
    })
    .optional(),
});

export type OperationalLog = z.infer<typeof operationalLogSchema>;

export function redactOperationalText(value: string): string {
  return value
    .replace(mongoCredentialPattern, "$1[REDACTED]@")
    .replace(openAiTokenPattern, "[REDACTED]")
    .replace(bearerTokenPattern, "Bearer [REDACTED]")
    .replace(sensitiveJsonValuePattern, '$1"[REDACTED]"')
    .replace(sensitiveQueryValuePattern, "$1[REDACTED]");
}
