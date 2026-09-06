import * as z from "zod";

import {
  parseAuthEnv,
  parseCopilotEnv,
  parseInvitationEmailEnv,
  parseServerEnv,
} from "@/server/env";

const preflightCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["ready", "warning", "blocked"]),
  message: z.string().min(1),
});

export const preflightResultSchema = z.object({
  status: z.enum(["ready", "blocked"]),
  checks: z.array(preflightCheckSchema),
});
export type PreflightResult = z.infer<typeof preflightResultSchema>;

function nodeMajor(version: string): number | null {
  const parsed = z.coerce.number().int().safeParse(version.split(".")[0]);
  return parsed.success ? parsed.data : null;
}

export function evaluatePreproductionEnvironment(
  input: Record<string, string | undefined>,
  runtimeVersion = process.versions.node,
): PreflightResult {
  const checks: z.infer<typeof preflightCheckSchema>[] = [];
  const major = nodeMajor(runtimeVersion);
  checks.push({
    id: "node-runtime",
    label: "Runtime Node.js",
    status: major === 24 ? "ready" : "blocked",
    message:
      major === 24
        ? `Node.js ${runtimeVersion} LTS`
        : "Node.js 24 LTS est requis par le paquet de déploiement",
  });

  try {
    const server = parseServerEnv(input);
    const atlasUri =
      server.MONGODB_URI.startsWith("mongodb+srv://") &&
      !server.MONGODB_URI.includes("cluster.example.mongodb.net");
    checks.push({
      id: "mongodb",
      label: "MongoDB Atlas",
      status: atlasUri ? "ready" : "blocked",
      message: atlasUri
        ? "URI Atlas chiffrée configurée"
        : "Utilisez une URI mongodb+srv réelle, distincte de l’exemple",
    });
    const databasesAreSeparated =
      server.MONGODB_AUTH_DB !== server.MONGODB_APP_DB;
    checks.push({
      id: "database-separation",
      label: "Séparation des bases",
      status: databasesAreSeparated ? "ready" : "blocked",
      message: databasesAreSeparated
        ? "Bases d’authentification et métier distinctes"
        : "MONGODB_AUTH_DB et MONGODB_APP_DB doivent être distinctes",
    });
  } catch {
    checks.push({
      id: "mongodb",
      label: "MongoDB Atlas",
      status: "blocked",
      message: "Configuration MongoDB invalide ou incomplète",
    });
  }

  try {
    const auth = parseAuthEnv(input);
    const secureUrl = new URL(auth.BETTER_AUTH_URL).protocol === "https:";
    checks.push({
      id: "public-url",
      label: "URL publique",
      status: secureUrl ? "ready" : "blocked",
      message: secureUrl
        ? "Origine HTTPS configurée"
        : "BETTER_AUTH_URL doit utiliser HTTPS en préproduction",
    });
    const secretLooksReal =
      !/replace|change|example|secret-with/i.test(auth.BETTER_AUTH_SECRET);
    checks.push({
      id: "auth-secret",
      label: "Secret Better Auth",
      status: secretLooksReal ? "ready" : "blocked",
      message: secretLooksReal
        ? "Secret dédié présent"
        : "Remplacez le secret d’exemple par une valeur aléatoire dédiée",
    });
    checks.push({
      id: "public-signup",
      label: "Inscription publique",
      status: auth.AUTH_ALLOW_SIGN_UP ? "blocked" : "ready",
      message: auth.AUTH_ALLOW_SIGN_UP
        ? "Désactivez AUTH_ALLOW_SIGN_UP pour conserver l’inscription sur invitation"
        : "Inscription limitée aux invitations",
    });
  } catch {
    checks.push({
      id: "authentication",
      label: "Better Auth",
      status: "blocked",
      message: "Configuration Better Auth invalide ou incomplète",
    });
  }

  try {
    const email = parseInvitationEmailEnv(input);
    const configured = email.INVITATION_EMAIL_PROVIDER === "resend";
    checks.push({
      id: "invitation-email",
      label: "E-mails d’invitation",
      status: configured ? "ready" : "blocked",
      message: configured
        ? "Fournisseur Resend configuré"
        : "Configurez Resend pour remplacer la remise manuelle des liens",
    });
  } catch {
    checks.push({
      id: "invitation-email",
      label: "E-mails d’invitation",
      status: "blocked",
      message: "Configuration Resend invalide ou incomplète",
    });
  }

  try {
    const copilot = parseCopilotEnv(input);
    checks.push({
      id: "copilot",
      label: "Copilote",
      status: copilot.OPENAI_API_KEY ? "ready" : "warning",
      message: copilot.OPENAI_API_KEY
        ? "Clé serveur configurée"
        : "Copilote désactivé : aucune clé serveur configurée",
    });
  } catch {
    checks.push({
      id: "copilot",
      label: "Copilote",
      status: "blocked",
      message: "Configuration Copilote invalide",
    });
  }

  return preflightResultSchema.parse({
    status: checks.some(({ status }) => status === "blocked")
      ? "blocked"
      : "ready",
    checks,
  });
}
