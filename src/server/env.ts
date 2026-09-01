import * as z from "zod";

const mongoUriSchema = z
  .string()
  .min(1, "MONGODB_URI est requis")
  .refine(
    (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
    "MONGODB_URI doit utiliser le protocole mongodb:// ou mongodb+srv://",
  );

export const serverEnvSchema = z.object({
  MONGODB_URI: mongoUriSchema,
  MONGODB_AUTH_DB: z.string().trim().min(1).default("fl_cockpit_auth"),
  MONGODB_APP_DB: z.string().trim().min(1).default("fl_cockpit_app"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET doit contenir au moins 32 caractères"),
  BETTER_AUTH_URL: z.url(),
  AUTH_ALLOW_SIGN_UP: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

export const importEnvSchema = z.object({
  IMPORT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(50_000_000)
    .default(10_000_000),
});

export type ImportEnv = z.infer<typeof importEnvSchema>;

export class EnvironmentValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    super("Configuration serveur invalide");
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

export function parseServerEnv(
  input: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }

  return result.data;
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

export function parseAuthEnv(
  input: Record<string, string | undefined>,
): AuthEnv {
  const result = authEnvSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }

  return result.data;
}

export function getAuthEnv(): AuthEnv {
  return parseAuthEnv(process.env);
}

export function getImportEnv(): ImportEnv {
  const result = importEnvSchema.safeParse(process.env);

  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }

  return result.data;
}
