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
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  MONGODB_MAX_IDLE_TIME_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(5_000),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(5_000),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(60_000)
    .default(10_000),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(8_000),
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

const optionalApiKeySchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().min(1).optional(),
);

const optionalTrimmedStringSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().min(1).optional(),
);

const invitationEmailFromSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .refine((value) => !/[\r\n]/.test(value), "Expéditeur e-mail invalide")
  .refine((value) => {
    const friendlyAddress = /<([^<>]+)>$/.exec(value);
    return z.email().safeParse(friendlyAddress?.[1] ?? value).success;
  }, "Expéditeur e-mail invalide");

export const invitationEmailEnvSchema = z
  .object({
    INVITATION_EMAIL_PROVIDER: z.enum(["manual", "resend"]).default("manual"),
    RESEND_API_KEY: optionalTrimmedStringSchema,
    INVITATION_EMAIL_FROM: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim().length === 0
          ? undefined
          : value,
      invitationEmailFromSchema.optional(),
    ),
    INVITATION_EMAIL_REPLY_TO: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim().length === 0
          ? undefined
          : value,
      z.email().optional(),
    ),
    INVITATION_EMAIL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(30_000)
      .default(10_000),
  })
  .superRefine((input, context) => {
    if (input.INVITATION_EMAIL_PROVIDER !== "resend") return;
    if (!input.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY est requis avec le fournisseur Resend",
      });
    }
    if (!input.INVITATION_EMAIL_FROM) {
      context.addIssue({
        code: "custom",
        path: ["INVITATION_EMAIL_FROM"],
        message: "INVITATION_EMAIL_FROM est requis avec le fournisseur Resend",
      });
    }
  });

export type InvitationEmailEnv = z.infer<typeof invitationEmailEnvSchema>;

export const copilotEnvSchema = z.object({
  OPENAI_API_KEY: optionalApiKeySchema,
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5-mini"),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(4_000)
    .default(2_400),
  OPENAI_MAX_TOOL_ROUNDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(8)
    .default(4),
  OPENAI_REASONING_EFFORT: z
    .enum(["minimal", "low", "medium", "high"])
    .default("low"),
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(120_000)
    .default(30_000),
});

export type CopilotEnv = z.infer<typeof copilotEnvSchema>;

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

export function parseCopilotEnv(
  input: Record<string, string | undefined>,
): CopilotEnv {
  const result = copilotEnvSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }

  return result.data;
}

export function getCopilotEnv(): CopilotEnv {
  return parseCopilotEnv(process.env);
}

export function getCopilotConfigurationStatus(): {
  configured: boolean;
  model: string;
} {
  const environment = getCopilotEnv();
  return {
    configured: Boolean(environment.OPENAI_API_KEY),
    model: environment.OPENAI_MODEL,
  };
}

export function parseInvitationEmailEnv(
  input: Record<string, string | undefined>,
): InvitationEmailEnv {
  const result = invitationEmailEnvSchema.safeParse(input);

  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }

  return result.data;
}

export function getInvitationEmailEnv(): InvitationEmailEnv {
  return parseInvitationEmailEnv(process.env);
}

export function getInvitationEmailConfigurationStatus(): {
  provider: InvitationEmailEnv["INVITATION_EMAIL_PROVIDER"];
  configured: boolean;
} {
  const environment = getInvitationEmailEnv();
  return {
    provider: environment.INVITATION_EMAIL_PROVIDER,
    configured: environment.INVITATION_EMAIL_PROVIDER === "resend",
  };
}
